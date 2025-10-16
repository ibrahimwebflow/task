// admin-disputes.js
import { supabase } from "../../../supabase/config.js";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("disputesContainer");
  const refreshBtn = document.getElementById("refreshDisputes");

  if (!container) return;

  refreshBtn?.addEventListener("click", loadDisputes);

  // ensure admin only
  (async function ensureAdminThenLoad() {
    const ok = await checkAdmin();
    if (!ok) {
      container.innerHTML = "<p class='error'>Access denied — admin only.</p>";
      return;
    }
    loadDisputes();
  })();

  async function checkAdmin() {
    const { data: { user }, error: ua } = await supabase.auth.getUser();
    if (ua || !user) return false;
    const { data, error } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (error || !data) return false;
    return data.role === "admin";
  }

  // Load open disputes
  async function loadDisputes() {
    container.innerHTML = "<div class='loading'>Loading disputes...</div>";

    try {
      const { data, error } = await supabase
        .from("disputes")
        .select(`
          id,
          hire_id,
          client_id,
          freelancer_id,
          reason,
          status,
          created_at,
          resolved_at,
          resolution,
          hires:hire_id ( jobs(id, title), client_id, freelancer_id )
        `)
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        container.innerHTML = "<p class='empty-state'>No open disputes.</p>";
        return;
      }

      container.innerHTML = "";
      data.forEach(d => {
        const card = document.createElement("div");
        card.className = "card dispute-card";
        const jobTitle = d.hires?.jobs?.title ?? "—";
        card.innerHTML = `
          <h3>Hire: ${d.hire_id} — ${escapeHtml(jobTitle)}</h3>
          <p><b>Client:</b> ${d.client_id} &nbsp; <b>Freelancer:</b> ${d.freelancer_id}</p>
          <p><b>Raised:</b> ${new Date(d.created_at).toLocaleString()}</p>
          <p><b>Reason:</b><br>${escapeHtml(d.reason)}</p>
          <div class="dispute-actions" style="margin-top:10px;">
            <button class="btn resolve-btn" data-id="${d.id}">Resolve (re-hold & ready)</button>
            <button class="btn reject-btn" data-id="${d.id}">Reject (refund/other)</button>
            <button class="btn view-hire-btn" data-hire="${d.hire_id}">Open Hire</button>
          </div>
          <div class="dispute-result" id="result-${d.id}" style="margin-top:8px;font-family:monospace;"></div>
        `;
        container.appendChild(card);
      });

      // attach handlers
      document.querySelectorAll(".resolve-btn").forEach(b => b.addEventListener("click", onResolve));
      document.querySelectorAll(".reject-btn").forEach(b => b.addEventListener("click", onReject));
      document.querySelectorAll(".view-hire-btn").forEach(b => b.addEventListener("click", e => {
        const hireId = e.target.dataset.hire;
        window.location.href = `../admin/final-submissions.html?hire=${hireId}`;
      }));

    } catch (err) {
      console.error("Error loading disputes:", err);
      container.innerHTML = `<p class="error">Failed to load disputes: ${err.message || JSON.stringify(err)}</p>`;
    }
  }

  // Resolve button handler — calls resolve_dispute RPC
  async function onResolve(e) {
    const id = e.target.dataset.id;
    const resultEl = document.getElementById(`result-${id}`);
    const confirmMsg = confirm("Resolve dispute? This will mark dispute resolved and set coin_holds back to 'held' (ready for manual release).");
    if (!confirmMsg) return;
    const resolution = prompt("Enter resolution note (brief):", "Admin resolved - re-hold funds");
    if (resolution === null) return; // user cancelled

    e.target.disabled = true;
    resultEl.textContent = "Resolving...";

    try {
      const { data, error } = await supabase.rpc("resolve_dispute", { _dispute_id: id, _resolution: resolution });
      if (error) throw error;
      resultEl.innerHTML = `✅ Resolved: ${data?.message ?? "OK"}`;
      // refresh list
      setTimeout(loadDisputes, 800);
    } catch (err) {
      console.error("Resolve failed:", err);
      resultEl.innerHTML = `<span style="color:crimson;">Error: ${err.message || JSON.stringify(err)}</span>`;
    } finally {
      e.target.disabled = false;
    }
  }

  // Reject button handler — tries to call reject_dispute RPC (if exists)
  async function onReject(e) {
    const id = e.target.dataset.id;
    const resultEl = document.getElementById(`result-${id}`);
    const confirmMsg = confirm("Reject dispute? This will mark dispute rejected and attempt to refund or mark hold accordingly.");
    if (!confirmMsg) return;
    const note = prompt("Enter rejection note (optional):", "Admin rejected - refund client");
    if (note === null) return;

    e.target.disabled = true;
    resultEl.textContent = "Processing rejection...";

    try {
      // Try calling a reject_dispute RPC (recommended). If not present, fallback to updating table.
      const { data, error } = await supabase.rpc("reject_dispute", { _dispute_id: id, _resolution: note });
      if (!error) {
        resultEl.innerHTML = `✅ Rejected: ${data?.message ?? "OK"}`;
        setTimeout(loadDisputes, 800);
        return;
      }

      // If RPC call fails because function doesn't exist, attempt fallback server updates (may fail under RLS)
      console.warn("reject_dispute RPC error, attempting fallback update:", error);
      // fallback: mark dispute rejected and set coin_holds.status = 'refunded'
      const { error: dErr } = await supabase.from("disputes").update({
        status: "rejected",
        resolution: note,
        resolved_at: new Date().toISOString()
      }).eq("id", id);

      if (dErr) throw dErr;

      const { error: chErr } = await supabase.from("coin_holds").update({
        status: "refunded"
      }).eq("dispute_id", id);

      if (chErr) throw chErr;

      resultEl.innerHTML = `✅ Rejected (fallback). Marked dispute rejected and coin_holds refunded.`;
      setTimeout(loadDisputes, 800);
    } catch (err) {
      console.error("Reject failed:", err);
      resultEl.innerHTML = `<span style="color:crimson;">Error: ${err.message || JSON.stringify(err)}</span>`;
    } finally {
      e.target.disabled = false;
    }
  }

  // tiny helper to avoid XSS in rendered small admin UI
  function escapeHtml(str = "") {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
});
