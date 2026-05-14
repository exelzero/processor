# SQL Stored Procedure Analyzer — Build Spec

## Purpose

A CLI tool that connects read-only to a SQL Server database, fetches stored procedure
definitions, runs a rule-based analysis, and reports issues with severity levels.
Designed to run in CI/CD pipelines and fail builds on critical findings.

---

## Problem Statement

The following issues exist in the reference procedure `GetCustomerOrderSummary` and
represent the full catalog of rule categories this tool must detect:

```sql
CREATE PROCEDURE GetCustomerOrderSummary
  @CustomerName VARCHAR(100),
  @StartDate    VARCHAR(50)       -- [RULE] wrong type: should be DATE/DATETIME
AS
BEGIN
  EXEC('SELECT * FROM OrderHistory WHERE CustomerName = ''' + @CustomerName + '''')
  --    ^^ [RULE] SQL injection: dynamic EXEC with raw parameter concatenation
  --                ^^ [RULE] SELECT *: avoid wildcard column selection

  SELECT *                        -- [RULE] SELECT *
  FROM Orders o, Customers c      -- [RULE] implicit JOIN: use explicit INNER JOIN
  WHERE o.CustomerId = c.Id
    AND c.Name LIKE '%' + @CustomerName + '%'   -- [RULE] leading wildcard: non-sargable
    AND YEAR(o.OrderDate) = 2024                -- [RULE] function on column: non-sargable
                                                -- [RULE] hardcoded literal year
    AND CAST(o.OrderDate AS VARCHAR) > @StartDate  -- [RULE] date-to-string cast + string date compare
END
-- Missing: TRY/CATCH, SET NOCOUNT ON          -- [RULE] missing best-practice boilerplate
```

---

## CLI Interface

```
sql-analyzer [OPTIONS] <procedure-name> [<procedure-name> ...]

Options:
  --connection-string  STR    ADO.NET/ODBC connection string (or env: SQL_ANALYZER_CONN)
  --schema             STR    Schema to scan (default: dbo). Use with --all.
  --all                       Analyze every procedure in the target schema
  --format             STR    Output format: text (default), json, sarif
  --severity           STR    Minimum severity to report: info|warning|error (default: info)
  --fail-on            STR    Exit 1 if any finding at or above this level: warning|error (default: error)
  --config             PATH   Path to rule config YAML (optional)
  --output             PATH   Write report to file instead of stdout
  --no-color                  Disable ANSI color in text output (set automatically in CI)
  --version
  --help

Exit codes:
  0  No findings at or above --fail-on threshold
  1  One or more findings at or above --fail-on threshold
  2  Tool error (connection failure, parse error, bad arguments)
```

### Example invocations

```bash
# Local dev — human-readable
sql-analyzer GetCustomerOrderSummary \
  --connection-string "Server=localhost;Database=mydb;Trusted_Connection=true;"

# CI/CD — JSON report, fail on warnings
sql-analyzer --all --schema dbo \
  --connection-string "$SQL_ANALYZER_CONN" \
  --format json \
  --fail-on warning \
  --output report.json

# GitHub Actions — SARIF for inline PR annotations
sql-analyzer --all \
  --connection-string "$SQL_ANALYZER_CONN" \
  --format sarif \
  --output results.sarif
```

---

## Architecture

```
sql-analyzer/
├── cli.py                  # Argument parsing, orchestration, exit codes
├── fetcher.py              # Read procedure text + metadata from sys.* views
├── parser.py               # SQL tokenizer/AST wrapper (sqlglot)
├── rules/
│   ├── __init__.py         # Rule registry
│   ├── security.py         # Injection, dynamic SQL
│   ├── performance.py      # Non-sargable predicates, SELECT *, leading wildcard
│   ├── correctness.py      # Type mismatches, date/string comparisons
│   └── style.py            # Implicit joins, missing boilerplate
├── reporter.py             # Formats findings → text / JSON / SARIF
├── config.py               # Load and merge rule config YAML
└── config.default.yaml     # Shipped defaults (severities, rule on/off)
```

### Data flow

```
CLI args
  └─► fetcher.py
        ├─► sys.sql_modules   (procedure source text)
        ├─► sys.parameters    (parameter names + types)
        └─► sys.objects       (existence check)
              └─► parser.py (sqlglot AST)
                    └─► rules/*.py  (each rule walks the AST + metadata)
                          └─► reporter.py
                                └─► stdout / file
```

---

## Rule Catalog

Each rule has: **ID**, **name**, **severity**, **description**, **detection strategy**.

### Security

| ID | Name | Severity | Detection |
|----|------|----------|-----------|
| S001 | dynamic-sql-injection | ERROR | AST: `EXEC(expr)` where `expr` contains `+` and a parameter reference |
| S002 | dynamic-sql-no-sp-executesql | WARNING | `EXEC(string)` present; prefer `sp_executesql` with parameters |

### Performance

| ID | Name | Severity | Detection |
|----|------|----------|-----------|
| P001 | select-star | WARNING | Any `SELECT *` in procedure body |
| P002 | leading-wildcard-like | WARNING | `LIKE` predicate whose pattern starts with `%` or `_` |
| P003 | function-on-indexed-column | WARNING | Function call wrapping a column in a `WHERE` clause (e.g. `YEAR(col)`, `CAST(col AS ...)`) |
| P004 | hardcoded-literal-in-where | INFO | Literal integer/string in WHERE that looks like a year or status code |

### Correctness

| ID | Name | Severity | Detection |
|----|------|----------|-----------|
| C001 | date-param-as-varchar | ERROR | Parameter declared `VARCHAR`/`NVARCHAR` whose name contains "date", "start", "end", "from", "to" (case-insensitive), OR used in date comparisons |
| C002 | date-string-comparison | ERROR | `CAST(col AS VARCHAR)` or `CONVERT(VARCHAR, col)` on a datetime column used in a comparison operator |
| C003 | type-mismatch-comparison | WARNING | Operands of `=`, `>`, `<` etc. have incompatible inferred types |

### Style / Best Practice

| ID | Name | Severity | Detection |
|----|------|----------|-----------|
| ST001 | implicit-join-syntax | WARNING | Comma-separated tables in `FROM` clause (old-style cross/inner join) |
| ST002 | missing-try-catch | INFO | Procedure body contains no `TRY`/`CATCH` block |
| ST003 | missing-set-nocount-on | INFO | `SET NOCOUNT ON` not present at procedure start |

---

## Output Formats

### Text (default)

```
GetCustomerOrderSummary — 8 findings (1 error, 5 warnings, 2 info)

  [ERROR]   S001  Line 6   dynamic-sql-injection
                           EXEC() concatenates @CustomerName directly. Use sp_executesql
                           with parameters.

  [ERROR]   C001  Line 3   date-param-as-varchar
                           @StartDate declared VARCHAR(50) but name implies a date.
                           Use DATE or DATETIME2.

  [WARNING] P001  Line 6   select-star
                           SELECT * in dynamic query. Enumerate columns explicitly.

  [WARNING] P001  Line 8   select-star
                           SELECT * in static query. Enumerate columns explicitly.

  [WARNING] ST001 Line 10  implicit-join-syntax
                           Comma join between Orders and Customers. Use INNER JOIN.

  [WARNING] P002  Line 11  leading-wildcard-like
                           LIKE '%' + @CustomerName forces a full table scan.

  [WARNING] P003  Line 12  function-on-indexed-column
                           YEAR(o.OrderDate) prevents index seeks. Use a date range
                           instead: o.OrderDate >= '2024-01-01' AND o.OrderDate < '2025-01-01'

  [WARNING] C002  Line 13  date-string-comparison
                           CAST(o.OrderDate AS VARCHAR) compared to @StartDate (VARCHAR).
                           Compare DATE to DATE.

  [INFO]    ST002  —       missing-try-catch
                           No TRY/CATCH block found.

  [INFO]    ST003  —       missing-set-nocount-on
                           SET NOCOUNT ON not found at procedure start.
```

### JSON

```json
{
  "procedure": "GetCustomerOrderSummary",
  "schema": "dbo",
  "analyzed_at": "2026-05-14T10:22:00Z",
  "summary": { "error": 2, "warning": 5, "info": 2 },
  "findings": [
    {
      "rule_id": "S001",
      "name": "dynamic-sql-injection",
      "severity": "error",
      "line": 6,
      "message": "EXEC() concatenates @CustomerName directly. Use sp_executesql with parameters.",
      "suggestion": "Replace EXEC(string) with EXEC sp_executesql @sql, N'@CustomerName VARCHAR(100)', @CustomerName"
    }
  ]
}
```

### SARIF

Standard [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
output for upload to GitHub Code Scanning (`upload-sarif` action). Each finding maps to a
SARIF `result` with `ruleId`, `level`, `message`, and `locations[].physicalLocation`.

---

## CI/CD Integration

### GitHub Actions

```yaml
- name: Analyze stored procedures
  run: |
    sql-analyzer --all --schema dbo \
      --connection-string "${{ secrets.SQL_ANALYZER_CONN }}" \
      --format sarif \
      --fail-on error \
      --output results.sarif

- name: Upload results to Code Scanning
  uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: results.sarif
```

### Generic CI (exit code contract)

```bash
sql-analyzer --all --fail-on error
# exits 0  → pipeline continues
# exits 1  → pipeline fails with finding list on stdout
# exits 2  → pipeline fails with error on stderr (don't silence stderr)
```

---

## Configuration

`config.yaml` allows per-project overrides without changing tool source:

```yaml
rules:
  S001:
    severity: error     # override severity
    enabled: true
  ST002:
    enabled: false      # silence missing-try-catch for legacy procs
  P004:
    enabled: false

# Patterns in procedure names to skip entirely (regex)
exclude_procedures:
  - "^sp_legacy_.*"
  - "^usp_temp_.*"
```

---

## Fetcher — Read-Only Queries

The tool only ever reads from system catalog views. No writes, no DDL.

```sql
-- Fetch procedure source
SELECT sm.definition
FROM   sys.sql_modules sm
JOIN   sys.objects o ON o.object_id = sm.object_id
WHERE  o.name = @ProcedureName
  AND  SCHEMA_NAME(o.schema_id) = @Schema;

-- Fetch parameter metadata
SELECT p.name, t.name AS type_name, p.max_length, p.is_output
FROM   sys.parameters p
JOIN   sys.types t ON t.user_type_id = p.user_type_id
WHERE  p.object_id = OBJECT_ID(@FullyQualifiedName);

-- Sweep all procedures in schema (--all)
SELECT o.name
FROM   sys.objects o
WHERE  o.type = 'P'
  AND  SCHEMA_NAME(o.schema_id) = @Schema;
```

---

## Technology Choices

| Concern | Choice | Reason |
|---------|--------|--------|
| Language | Python 3.11+ | fast to iterate, strong SQL parsing libs |
| SQL parsing | [sqlglot](https://github.com/tobymao/sqlglot) | T-SQL dialect support, AST walk API |
| DB connection | `pyodbc` + `pymssql` fallback | read-only, no ORM needed |
| CLI | `argparse` (stdlib) | no extra dep for a dev tool |
| SARIF output | hand-rolled (small schema subset) | avoid heavy dependency |
| Tests | `pytest` + `sqlglot` to parse fixture SQL strings | no DB needed for unit tests |

---

## Out of Scope (v1)

- Support for other databases (PostgreSQL, MySQL) — T-SQL only
- Auto-fix / rewriting procedures
- Execution plan analysis (requires `SHOWPLAN` permission, not read-only)
- Cross-procedure dependency analysis
- Performance benchmarking / query cost estimation

---

## Open Questions for Implementer

1. Should `--all` process procedures in parallel or sequentially? (parallel = faster, noisier output ordering)
2. Should `C001` (date param as varchar) be triggered by name pattern alone, or only when the parameter is actually used in a date context? Name-only has false positives.
3. Line numbers from `sys.sql_modules` are relative to the `CREATE PROCEDURE` statement — confirm offset handling in parser.
4. SARIF `physicalLocation` requires a URI. For DB objects, use a synthetic URI scheme: `proc://dbo/GetCustomerOrderSummary#L6`.
