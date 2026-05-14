import { useState, useCallback } from "react";
import api from "../api";

export function useExpenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ category, month } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (category) params.category = category;
      if (month) params.month = month;
      const res = await api.get("/expenses/", { params });
      setExpenses(res.data);
    } catch (e) {
      setError(e.response?.data?.detail ?? "Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (data) => {
    const res = await api.post("/expenses/", data);
    return res.data;
  }, []);

  const update = useCallback(async (id, data) => {
    const res = await api.put(`/expenses/${id}`, data);
    return res.data;
  }, []);

  const remove = useCallback(async (id) => {
    await api.delete(`/expenses/${id}`);
  }, []);

  return { expenses, loading, error, load, create, update, remove };
}
