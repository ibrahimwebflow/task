import { supabase } from "../../supabase/config.js";

export async function loadBadgesOverview() {
  const container = document.getElementById("badgesOverview");
  container.innerHTML = "<p>Loading overview...</p>";

  // Fetch all badges so admin can override
  const { data: allBadges } = await supabase
    .from("main_badges")
    .select("id, name");

  const { data, error } = await supabase
    .from("users")
    .select(`
      id,
      full_name,
      email,
      inbit_choice,
      inbit_partner,
      main_badge_id,
      achievements,
      main_badges(name)
    `)
    .eq("role", "freelancer");

  if (error) {
    container.innerHTML = "<p class='error'>Error loading overview.</p>";
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = "<p>No freelancers found.</p>";
    return;
  }

  // Build table
  let table = `
    <table class="overview-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Main Badge</th>
          <th>Achievements</th>
          <th>Inbit Choice</th>
          <th>Inbit Partner</th>
          <th>Override Main Badge</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach(user => {
    const achievements = user.achievements?.length
      ? user.achievements.map(a => a.badge).join(", ")
      : "<i>None</i>";

    // Build dropdown for ladder override
    let badgeOptions = allBadges
      .map(
        b =>
          `<option value="${b.id}" ${
            b.id === user.main_badge_id ? "selected" : ""
          }>${b.name}</option>`
      )
      .join("");

    table += `
      <tr>
        <td>${user.full_name}</td>
        <td>${user.email}</td>
        <td>${user.main_badges ? user.main_badges.name : "<i>None</i>"}</td>
        <td>${achievements}</td>
        <td>
          <button onclick="toggleBadge('${user.id}', 'inbit_choice', ${user.inbit_choice})">
            ${user.inbit_choice ? "Remove" : "Give"}
          </button>
        </td>
        <td>
          <button onclick="toggleBadge('${user.id}', 'inbit_partner', ${user.inbit_partner})">
            ${user.inbit_partner ? "Remove" : "Give"}
          </button>
        </td>
        <td>
          <select onchange="overrideMainBadge('${user.id}', this.value)">
            ${badgeOptions}
          </select>
        </td>
      </tr>
    `;
  });

  table += "</tbody></table>";
  container.innerHTML = table;
}

// ✅ Toggle badges (choice/partner)
window.toggleBadge = async function (userId, field, currentValue) {
  const { error } = await supabase
    .from("users")
    .update({ [field]: !currentValue })
    .eq("id", userId);

  if (error) {
    alert("Failed to update badge: " + error.message);
  } else {
    alert("Badge updated successfully!");
    loadBadgesOverview();
  }
};

// ✅ Override main badge manually
window.overrideMainBadge = async function (userId, badgeId) {
  const { error } = await supabase
    .from("users")
    .update({ main_badge_id: badgeId })
    .eq("id", userId);

  if (error) {
    alert("Failed to override main badge: " + error.message);
  } else {
    alert("Main badge overridden successfully!");
    loadBadgesOverview();
  }
};

// Attach button
document.getElementById("loadBadgesOverviewBtn").addEventListener("click", loadBadgesOverview);

