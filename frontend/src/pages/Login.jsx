import { useState } from "react";
import { apiPost } from "../lib/api.js";
import { setToken } from "../lib/auth.js";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await apiPost("/auth/login", { email, password });
      setToken(data.token);
      navigate("/dashboard");
    } catch (err) {
      alert("Неверные учетные данные");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel narrow">
      <h2>Вход в систему</h2>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Проверка..." : "Войти"}
        </button>
      </form>
    </section>
  );
}
