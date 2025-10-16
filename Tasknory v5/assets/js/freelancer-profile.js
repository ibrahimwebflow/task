import { supabase } from "../../supabase/config.js";

const urlParams = new URLSearchParams(window.location.search);
const freelancerId = urlParams.get("id");

const nameEl = document.getElementById("freelancerName");
const langEl = document.getElementById("freelancerLanguage");
const toneEl = document.getElementById("freelancerTone");
const skillsList = document.getElementById("freelancerSkills");
const profilePic = document.getElementById("profilePicture");
const contractsDiv = document.getElementById("completedContracts");

if (!freelancerId) {
  document.body.innerHTML = "<p class='error'>No freelancer specified.</p>";
  throw new Error("No freelancer ID provided in URL");
}

async function loadFreelancerProfile() {
const { data, error } = await supabase
  .from("users")
.select(`
  id,
  full_name,
  tone,
  language,
  profile_picture,
  inbit_choice,
  inbit_partner,
  achievements,
  main_badges(name),
  freelancer_skills(
    skill_id,
    verified,
    skills_master(skill_name)
  )
`)


  .eq("id", freelancerId)
  .single();


  if (error) {
    console.error("Error loading freelancer:", error);
    document.body.innerHTML = "<p class='error'>Failed to load freelancer profile.</p>";
    return;
  }

  nameEl.textContent = data.full_name;
  // Ladder badge
if (data.main_badges) {
  const badgeEl = document.createElement("span");
  badgeEl.className = "ladder-badge";
  badgeEl.textContent = data.main_badges.name;
  nameEl.appendChild(document.createTextNode(" ")); // spacing
  nameEl.appendChild(badgeEl);
}

// Manual badges
const badgeContainer = document.getElementById("badgeContainer");
badgeContainer.innerHTML = ""; 

if (data.inbit_choice) {
  badgeContainer.innerHTML += `<span class="badge choice">Inbit Choice</span>`;
}
if (data.inbit_partner) {
  badgeContainer.innerHTML += `<span class="badge partner">Inbit Partner</span>`;
}

// Achievement badges
// Render achievements
if (Array.isArray(data.achievements) && data.achievements.length > 0) {
  const achievementsHtml = data.achievements
    .map(a => `<span class="badge">${a}</span>`)
    .join(" ");
  document.getElementById("freelancerAchievements").innerHTML = achievementsHtml;
} else {
  document.getElementById("freelancerAchievements").innerHTML = "<i>No achievements yet</i>";
}


  langEl.textContent = data.language || "-";
  toneEl.textContent = data.tone || "-";

  if (data.profile_picture) {
    const { data: urlData, error: urlErr } = await supabase.storage
      .from("profile_pictures")
      .createSignedUrl(data.profile_picture, 60);

    if (!urlErr) {
      profilePic.src = urlData.signedUrl;
    }
  }

  if (data.freelancer_skills?.length > 0) {
    skillsList.innerHTML = "";
    data.freelancer_skills.forEach((fs) => {
      const li = document.createElement("li");
      li.innerHTML = `${fs.skills_master.skill_name} ${
        fs.verified ? "<span class='badge verified'>Verified</span>" : ""
      }`;
      skillsList.appendChild(li);
    });
  } else {
    skillsList.innerHTML = "<li>No skills available</li>";
  }

}

// call with freelancerId (string)
async function loadCompletedContracts(freelancerId) {
  const contractsDiv = document.getElementById("contractsList");
  if (!contractsDiv) {
    console.error("Missing #contractsList container in HTML");
    return;
  }
  contractsDiv.innerHTML = "<p>Loading completed contracts...</p>";

  if (!freelancerId) {
    contractsDiv.innerHTML = "<p>No freelancer specified.</p>";
    return;
  }

  try {
    // --- Preferred: try a single query joining contracts -> hires -> jobs
    const { data, error } = await supabase
      .from("contracts")
      .select(`
        id,
        total_amount,
        status,
        created_at,
        hire_id,
        hires (
          id,
          jobs ( title, description ),
          users!hires_client_id_fkey ( id, full_name )
        )
      `)
      .eq("freelancer_id", freelancerId)
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (error) {
      // If relational-cache error comes back, we fall through to fallback below
      if (error.code === "PGRST200" || /relationship/i.test(error.message || "")) {
        throw error; // will be caught and fallback used
      }
      throw error; // other errors -> bubble up
    }

    if (!data || data.length === 0) {
      contractsDiv.innerHTML = "<p>No completed contracts yet.</p>";
      return;
    }

    // render results (handle cases where hires might be an array)
    contractsDiv.innerHTML = "<h3>Completed Contracts</h3>";
    data.forEach((contract) => {
      const hireObj = Array.isArray(contract.hires) ? contract.hires[0] : contract.hires;
      const job = hireObj?.jobs ?? null;
      const client = hireObj?.users ?? null;

      contractsDiv.innerHTML += `
        <div class="contract-card">
          <h4>${(job && job.title) || "Untitled job"}</h4>
          <p>${(job && job.description) || "No description"}</p>
          <p><strong>Total Amount:</strong> $${contract.total_amount ?? "N/A"}</p>
          ${client ? `<p><strong>Client:</strong> ${client.full_name}</p>` : ""}
          <small>Completed: ${new Date(contract.created_at).toLocaleString()}</small>
        </div>
      `;
    });

    return; // success, done!
  } catch (err) {
    console.warn("Nested join failed, falling back to two-step fetch. Reason:", err.message || err);
    // FALLBACK: fetch contracts first, then fetch hire+job per contract
  }

  // --- FALLBACK two-step approach (more work but works regardless of relationships)
  try {
    const { data: contractsOnly, error: cErr } = await supabase
      .from("contracts")
      .select("id, total_amount, status, hire_id, created_at")
      .eq("freelancer_id", freelancerId)
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (cErr) throw cErr;
    if (!contractsOnly || contractsOnly.length === 0) {
      contractsDiv.innerHTML = "<p>No completed contracts yet.</p>";
      return;
    }

    contractsDiv.innerHTML = "<h3>Completed Contracts</h3>";

    // Fetch hires in batch by hire_id (faster than one-by-one)
    const hireIds = contractsOnly.map((c) => c.hire_id).filter(Boolean);
    let hiresMap = {};
    if (hireIds.length > 0) {
      const { data: hiresData, error: hiresErr } = await supabase
        .from("hires")
        .select(`
          id,
          jobs ( title, description ),
          users!hires_client_id_fkey ( id, full_name )
        `)
        .in("id", hireIds);

      if (hiresErr) throw hiresErr;
      // create lookup map by hire id
      (hiresData || []).forEach(h => hiresMap[h.id] = h);
    }

    // Render each contract using hiresMap
    for (const contract of contractsOnly) {
      const hire = hiresMap[contract.hire_id];
      const job = hire?.jobs ?? null;
      const client = hire?.users ?? null;

      contractsDiv.innerHTML += `
        <div class="contract-card">
          <h4>${(job && job.title) || "Untitled job"}</h4>
          <p>${(job && job.description) || "No description"}</p>
          <p><strong>Total Amount:</strong> $${contract.total_amount ?? "N/A"}</p>
          ${client ? `<p><strong>Client:</strong> ${client.full_name}</p>` : ""}
          <small>Completed: ${new Date(contract.created_at).toLocaleString()}</small>
        </div>
      `;
    }
  } catch (fallbackErr) {
    console.error("Error loading contracts (fallback):", fallbackErr);
    contractsDiv.innerHTML = "<p class='error'>Failed to load completed contracts.</p>";
  }
}


await loadFreelancerProfile();
loadCompletedContracts(freelancerId);

