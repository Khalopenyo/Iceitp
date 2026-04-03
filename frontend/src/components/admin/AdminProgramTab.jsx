import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPut } from "../../lib/api.js";
import AdminProgramList from "./AdminProgramList.jsx";
import ProgramAssignmentForm from "./ProgramAssignmentForm.jsx";

export default function AdminProgramTab() {
  const [entries, setEntries] = useState([]);
  const [sections, setSections] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [programEntries, availableSections, availableRooms] = await Promise.all([
        apiGet("/admin/program"),
        apiGet("/sections"),
        apiGet("/rooms"),
      ]);
      setEntries(programEntries);
      setSections(availableSections);
      setRooms(availableRooms);
      setSelectedUserId((prev) => prev ?? programEntries[0]?.user_id ?? null);
    } catch (err) {
      setMessage(err.message || "Не удалось загрузить управление программой");
      setEntries([]);
      setSections([]);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.user_id === selectedUserId) || null,
    [entries, selectedUserId]
  );

  const handleSave = async (payload) => {
    if (!selectedEntry) return;
    setSaving(true);
    setMessage("");
    try {
      await apiPut(`/admin/program/${selectedEntry.user_id}`, payload);
      setMessage("Официальная программа обновлена");
      await load();
      setSelectedUserId(selectedEntry.user_id);
    } catch (err) {
      setMessage(err.message || "Не удалось сохранить утвержденную запись");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="form-actions">
        <div>
          <h3>Управление программой</h3>
          <p className="muted">
            Сравнивайте данные из регистрации с утвержденной программой и сохраняйте официальные секцию, аудиторию,
            слот и ссылку для подключения.
          </p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={load} disabled={loading}>
          {loading ? "Обновление..." : "Обновить список"}
        </button>
      </div>

      {message ? <p className="muted">{message}</p> : null}

      {loading ? (
        <p className="muted">Загрузка участников программы...</p>
      ) : (
        <>
          <AdminProgramList entries={entries} selectedUserId={selectedUserId} onSelect={setSelectedUserId} />
          {selectedEntry ? (
            <div className="card">
              <h4>Утверждение записи: {selectedEntry.full_name || selectedEntry.email}</h4>
              <ProgramAssignmentForm
                entry={selectedEntry}
                sections={sections}
                rooms={rooms}
                saving={saving}
                onSave={handleSave}
                onCancel={() => setSelectedUserId(null)}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
