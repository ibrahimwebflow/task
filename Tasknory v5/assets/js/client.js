import { supabase } from "../../supabase/config.js";

// Utility
function formToObject(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

// Handle job posting
async function handleJobPost(event) {
  event.preventDefault();
  
  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();
  
  if (sessionError || !user) {
    alert("You must be logged in to post a job.");
    return;
  }

  // ✅ NEW: Check ID verification first
  const { data: clientData, error: clientError } = await supabase
    .from("users")
    .select("id_verified, gov_id_path")
    .eq("id", user.id)
    .single();

  if (clientError) {
    console.error("Error fetching client data:", clientError);
    return;
  }

  // Check if ID is verified
  if (!clientData.id_verified) {
    if (!clientData.gov_id_path) {
      alert("❌ Please upload your government ID in settings before posting jobs.");
      window.location.href = "settings.html"; // Redirect to settings
    } else {
      alert("⏳ Your ID is pending admin verification. You'll be able to post jobs once verified.");
    }
    return;
  }

  const data = formToObject(event.target);
  const skillSelect = document.getElementById("requiredSkillsSelect");
  const selectedSkillIds = Array.from(skillSelect.selectedOptions).map((opt) =>
    parseInt(opt.value)
  );

  // Rest of your existing job posting logic...
  const paymentType = data.payment_type;
  let milestonesData = [];
  let totalBudget = 0;

  if (paymentType === 'milestone') {
    milestonesData = collectMilestonesData();
    
    if (milestonesData.length === 0) {
      alert("Please add at least one milestone for milestone-based jobs.");
      return;
    }

    totalBudget = milestonesData.reduce((sum, milestone) => sum + milestone.amount, 0);
    
    if (totalBudget <= 0) {
      alert("Total milestone budget must be greater than 0.");
      return;
    }
  } else {
    totalBudget = parseFloat(data.budget);
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      client_id: user.id,
      title: data.title,
      description: data.description,
      expected_outcome: data.expected_outcome,
      required_skill_ids: selectedSkillIds,
      preferred_tone: data.preferred_tone,
      budget: totalBudget,
      language: data.language || "English",
      deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
      payment_type: paymentType,
      approved: false,
    })
    .select('id')
    .single();

  if (jobError) {
    alert("Job posting failed: " + jobError.message);
    return;
  }

  if (paymentType === 'milestone' && milestonesData.length > 0) {
    const milestonesWithJobId = milestonesData.map(milestone => ({
      job_id: job.id,
      title: milestone.title,
      description: milestone.description,
      amount: milestone.amount,
      sequence: milestone.sequence,
      status: 'pending'
    }));

    const { error: milestonesError } = await supabase
      .from("milestones")
      .insert(milestonesWithJobId);

    if (milestonesError) {
      console.error("Failed to create milestones:", milestonesError);
    }
  }

  alert("Job submitted! Awaiting admin approval.");
  event.target.reset();
  
  const milestonesSection = document.getElementById("milestonesSection");
  const singleBudgetGroup = document.getElementById("singleBudgetGroup");
  const paymentTypeSelect = document.getElementById("payment_type");
  
  milestonesSection.style.display = 'none';
  singleBudgetGroup.style.display = 'block';
  paymentTypeSelect.value = 'single';
  
  const milestonesContainer = document.getElementById("milestonesContainer");
  milestonesContainer.innerHTML = '';
}

// NEW: Collect milestones data from form
function collectMilestonesData() {
  const milestones = [];
  const milestoneElements = document.querySelectorAll('.milestone-item');
  
  milestoneElements.forEach((element, index) => {
    const title = element.querySelector('.milestone-title')?.value;
    const amount = element.querySelector('.milestone-amount')?.value;
    const description = element.querySelector('.milestone-description')?.value;
    
    if (title && amount && description) {
      milestones.push({
        sequence: index + 1,
        title: title.trim(),
        amount: parseFloat(amount),
        description: description.trim()
      });
    }
  });
  
  return milestones;
}

// Load matches for this client
export async function loadMatches() {
  const matchesList = document.getElementById("matchesList");

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    matchesList.innerHTML =
      "<p class='error'>You must be logged in to view matches.</p>";
    return;
  }

  // ✅ Fetch matches with freelancer skills + skill names + hires
  // ✅ CORRECTED: Fixed the select query syntax
  const { data, error: matchError } = await supabase
    .from("job_matches")
    .select(
      `
      id,
      score,
      approved,
      jobs(
        id,
        title,
        description,
        client_id,
        required_skill_ids,
        payment_type,
        hires(id)
      ),
      users(
        id,
        full_name,
        tone,
        language,
        inbit_choice,
        inbit_partner,
        main_badges(name),
        freelancer_skills(
          skill_id,
          verified,
          skills_master(skill_name)
        )
      )
    `
    )
    .eq("approved", true);

  if (matchError) {
    matchesList.innerHTML = "<p class='error'>Error loading matches.</p>";
    console.error(matchError);
    return;
  }

  // ✅ Only client's matches
  const clientMatches = data.filter((m) => m.jobs.client_id === user.id);

  // ✅ Filter: only show matches if no hire exists for that job
  const unHiredMatches = clientMatches.filter(
    (m) => !m.jobs.hires || m.jobs.hires.length === 0
  );

  if (unHiredMatches.length === 0) {
    matchesList.innerHTML =
      "<p class='loading'>No available matches (job already hired).</p>";
    return;
  }

  // Create proper grid structure
  matchesList.innerHTML = '<div class="matches-grid"></div>';
  const matchesGrid = matchesList.querySelector(".matches-grid");

  unHiredMatches.forEach((match, index) => {
    const freelancer = match.users;
    const jobSkills = match.jobs.required_skill_ids || [];
    const freelancerSkills = freelancer.freelancer_skills || [];

    // ✅ Match skills vs job required skills
    const matchedSkills = freelancerSkills.filter((fs) =>
      jobSkills.includes(fs.skill_id)
    );

    const matchedList = matchedSkills
      .map(
        (s) =>
          `<li>${s.skills_master.skill_name} ${
            s.verified ? "<span class='badge verified'>Verified</span>" : ""
          }</li>`
      )
      .join("");

    const card = document.createElement("div");
    card.classList.add("card");
    card.style.animationDelay = `${index * 0.1}s`;

    // NEW: Add payment type badge
    const paymentTypeBadge = match.jobs.payment_type === 'milestone' 
      ? '<span class="badge milestone-badge">💰 Milestone-based</span>'
      : '<span class="badge single-badge">💳 Single Payment</span>';

    card.innerHTML = `
      <h3>${match.jobs.title}</h3>
      <p class="job-description">${match.jobs.description}</p>
      ${paymentTypeBadge}
      <hr>
      <div class="match-info">
        <p><strong>Freelancer:</strong> ${freelancer.full_name}</p>
        <div class="freelancer-badges">
  ${
    freelancer.main_badges
      ? `<span class="badge ladder">${freelancer.main_badges.name}</span>`
      : ""
  }
  ${freelancer.inbit_choice ? `<span class="badge choice">Inbit Choice</span>` : ""}
  ${freelancer.inbit_partner ? `<span class="badge partner">Inbit Partner</span>` : ""}
</div>

        <p><strong>Tone:</strong> ${freelancer.tone}</p>
        <p><strong>Language:</strong> ${freelancer.language}</p>
        <p><strong>Match Score:</strong> <span class="score-indicator">${
          match.score
        }%</span></p>
      </div>
      <div class="matched-skills">
        <h4>Matched Skills</h4>
        ${
          matchedSkills.length > 0
            ? `<ul>${matchedList}</ul>`
            : `<p class="no-skills">No skills matched yet</p>`
        }
      </div>
      <div class="card-actions">
  <button class="btn btn-primary hire-btn">Hire Freelancer</button>
  <button class="btn btn-secondary view-profile-btn" data-id="${freelancer.id}">
    View Profile
  </button>
</div>

    `;

    card.querySelector(".hire-btn").addEventListener("click", () => {
      hireFreelancer(
        match.id,
        freelancer.id,
        freelancer.full_name,
        match.jobs.id
      );
    });

    matchesGrid.appendChild(card);
  });

  // View profile
document.querySelectorAll(".view-profile-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const freelancerId = e.target.dataset.id;
    window.location.href = `../client/freelancer-profile.html?id=${freelancerId}`;
  });
});

}

// This function should be called when a milestone-based job is hired
async function initializeMilestoneHolds(hireId, jobId) {
  try {
    // Get all milestones for this job
    const { data: milestones, error } = await supabase
      .from("milestones")
      .select("id, amount")
      .eq("job_id", jobId);

    if (error) throw error;

    if (!milestones || milestones.length === 0) {
      console.warn("No milestones found for job:", jobId);
      return;
    }

    // Create coin holds for each milestone
    const coinHolds = milestones.map(milestone => ({
      hire_id: hireId,
      milestone_id: milestone.id,
      amount: milestone.amount,
      status: 'held',
      released_at: null,
      created_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabase
      .from("coin_holds")
      .insert(coinHolds);

    if (insertError) throw insertError;

    console.log(`Created ${coinHolds.length} coin holds for hire ${hireId}`);
    
  } catch (error) {
    console.error("Error initializing milestone holds:", error);
  }
}

// Hire freelancer
window.hireFreelancer = async function (matchId, freelancerId, freelancerName, jobId) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    alert("You must be logged in.");
    return;
  }

  try {
    // FIRST: Let's check what the secure_hire function actually returns
    console.log("🔍 Calling secure_hire with:", { jobId, clientId: user.id, freelancerId });
    
    const { data, error } = await supabase.rpc("secure_hire", {
      _job_id: jobId,
      _client_id: user.id,
      _freelancer_id: freelancerId,
    });

    console.log("🔍 secure_hire response:", { data, error });

    if (error) {
      alert("Hire failed: " + error.message);
      return;
    }

    // Check if coin holds were created in secure_hire
    console.log("🔍 Checking if coin holds exist for hire:", data.hire_id);
    
    const { data: existingHolds, error: holdsError } = await supabase
      .from("coin_holds")
      .select("*")
      .eq("hire_id", data.hire_id);

    console.log("🔍 Existing coin holds:", existingHolds);

    if (!holdsError && existingHolds && existingHolds.length > 0) {
      console.log("✅ Coin holds already created by secure_hire function");
    } else {
      console.log("❌ No coin holds found - need to create them");
      
      // Get job payment type
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("payment_type, budget")
        .eq("id", jobId)
        .single();

      if (!jobErr) {
        if (job.payment_type === 'milestone') {
          await initializeMilestoneHolds(data.hire_id, jobId);
        }
        // For single payment, the secure_hire SHOULD have handled it
        console.log("ℹ️ Single payment - coin holds should be handled by secure_hire");
      }
    }

    alert(`You hired ${freelancerName}!`);
    window.location.href = `../chat/chat.html?hire=${data.hire_id}`;
    
  } catch (err) {
    console.error("Hire error:", err);
    alert("An unexpected error occurred while hiring.");
  }
};

// Load skills for job posting
async function loadSkills(selectId) {
  const { data, error } = await supabase
    .from("skills_master")
    .select("*")
    .order("skill_name");
  if (error) {
    console.error("Error loading skills:", error.message);
    return;
  }

  const select = document.getElementById(selectId);
  data.forEach((skill) => {
    const option = document.createElement("option");
    option.value = skill.id;
    option.textContent = skill.skill_name;
    select.appendChild(option);
  });
}

async function loadNotifications() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const list = document.getElementById("notificationsList");
  if (error || !data || data.length === 0) {
    list.innerHTML = "<li class='loading'>No notifications</li>";
    return;
  }

  list.innerHTML = "";
  data.forEach((n) => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${n.message}
      <button class="dismiss-btn" data-id="${n.id}">Dismiss</button>
    `;
    list.appendChild(li);
  });

  document.querySelectorAll(".dismiss-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.dataset.id;
      await deleteNotification(id);
      e.target.parentElement.remove();
    });
  });
}

async function deleteNotification(id) {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete notification:", error.message);
  }
}

// Hires
async function loadHires() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // First, get all hires for the client
  const { data: hires, error } = await supabase
    .from("hires")
    .select(
      `
      id,
      created_at,
      job_id,
      jobs(title, description, payment_type),
      users!hires_freelancer_id_fkey(full_name),
      final_submissions(status, id)
    `
    )
    .eq("client_id", user.id)
    .order("created_at", { ascending: false });

  const container = document.getElementById("hiresList");
  if (error) {
    console.error("Hires query error:", error);
    container.innerHTML = "<p class='error'>Error loading hires: " + error.message + "</p>";
    return;
  }

  if (!hires || hires.length === 0) {
    container.innerHTML = "<p class='loading'>No hires yet.</p>";
    return;
  }

  // Get coin holds data for single payment jobs
  const hireIds = hires.map(h => h.id);
  const { data: coinHolds, error: coinHoldsError } = await supabase
    .from("coin_holds")
    .select("hire_id, status")
    .in("hire_id", hireIds)
    .is("milestone_id", null); // Only get coin holds for single payments

  if (coinHoldsError) {
    console.error("Coin holds query error:", coinHoldsError);
  }

  // Create a map of hire_id to coin_hold status for single payment jobs
  const coinHoldStatusMap = {};
  coinHolds?.forEach(hold => {
    coinHoldStatusMap[hold.hire_id] = hold.status;
  });

  // Get milestones data for milestone payment jobs
  const milestoneJobIds = hires
    .filter(h => h.jobs.payment_type === 'milestone')
    .map(h => h.job_id);

  let milestonesData = [];
  if (milestoneJobIds.length > 0) {
    const { data: milestones, error: milestonesError } = await supabase
      .from("milestones")
      .select("job_id, status")
      .in("job_id", milestoneJobIds);

    if (milestonesError) {
      console.error("Milestones query error:", milestonesError);
    } else {
      milestonesData = milestones || [];
    }
  }

  // Group milestones by job_id and check if all are approved
  const milestonesByJob = {};
  milestonesData.forEach(milestone => {
    if (!milestonesByJob[milestone.job_id]) {
      milestonesByJob[milestone.job_id] = [];
    }
    milestonesByJob[milestone.job_id].push(milestone.status);
  });

  // Filter hires based on your criteria
  const filteredHires = hires.filter(hire => {
    if (hire.jobs.payment_type === 'single') {
      // For single payment: only show if coin hold is NOT released or refunded
      const coinHoldStatus = coinHoldStatusMap[hire.id];
      return coinHoldStatus !== 'released' && coinHoldStatus !== 'refunded';
    } else if (hire.jobs.payment_type === 'milestone') {
      // For milestone payment: only show if NOT all milestones are approved
      const jobMilestones = milestonesByJob[hire.job_id] || [];
      if (jobMilestones.length === 0) {
        // If no milestones found, show the hire (might be newly created)
        return true;
      }
      // Check if ALL milestones are approved
      const allApproved = jobMilestones.every(status => status === 'approved');
      return !allApproved; // Show if NOT all approved
    }
    // Default: show the hire if payment type is unknown
    return true;
  });

  if (filteredHires.length === 0) {
    container.innerHTML = "<p class='loading'>No active hires.</p>";
    return;
  }

  // Render the filtered hires
  container.innerHTML = '<div class="hires-grid"></div>';
  const hiresGrid = container.querySelector(".hires-grid");

  filteredHires.forEach((hire, index) => {
    const finalSub = hire.final_submissions?.[0];
    
    // Add payment type indicator
    const paymentTypeBadge = hire.jobs.payment_type === 'milestone' 
      ? '<span class="badge milestone-badge">💰 Milestone-based</span>'
      : '<span class="badge single-badge">💳 Single Payment</span>';

    // Add status info based on payment type
    let statusInfo = '';
    if (hire.jobs.payment_type === 'single') {
      const coinHoldStatus = coinHoldStatusMap[hire.id];
      statusInfo = `<p><strong>Payment Status:</strong> ${coinHoldStatus || 'held'}</p>`;
    } else if (hire.jobs.payment_type === 'milestone') {
      const jobMilestones = milestonesByJob[hire.job_id] || [];
      const approvedCount = jobMilestones.filter(status => status === 'approved').length;
      const totalCount = jobMilestones.length;
      statusInfo = `<p><strong>Milestone Progress:</strong> ${approvedCount}/${totalCount} completed</p>`;
    }

    const card = document.createElement("div");
    card.classList.add("card");
    card.style.animationDelay = `${index * 0.1}s`;

    card.innerHTML = `
      <h3>${hire.jobs.title}</h3>
      ${paymentTypeBadge}
      <p>${hire.jobs.description}</p>
      <p><strong>Freelancer:</strong> ${hire.users.full_name}</p>
      ${statusInfo}
      <small>Hired on ${new Date(hire.created_at).toLocaleString()}</small>
      <p><strong>Hire ID:</strong> ${hire.id}</p>
      <div class="card-actions">
        <button class="btn btn-primary"
          onclick="window.location.href='../chat/chat.html?hire=${hire.id}'">
          Chat
        </button>
        ${hire.jobs.payment_type === 'milestone' ? `
          <button class="btn btn-secondary"
            onclick="window.location.href='milestone-reviews.html?hire=${hire.id}'">
            Review Milestones
          </button>
        ` : ''}
      </div>
    `;

    hiresGrid.appendChild(card);
  });
}

// Initialize everything
document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Load components based on current page
  if (document.getElementById("matchesList")) loadMatches();
  if (document.getElementById("notificationsList")) loadNotifications();
  if (document.getElementById("hiresList")) loadHires();
  if (document.getElementById("requiredSkillsSelect"))
    loadSkills("requiredSkillsSelect");

  // Attach job form if exists
  const jobForm = document.getElementById("jobPostForm");
  if (jobForm) jobForm.addEventListener("submit", handleJobPost);
});

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("matchesList")) loadMatches();
  if (document.getElementById("hiresList")) loadHires();
});

// ... rest of the existing functions (createContract, markPaymentSent, loadClientSummary, theme toggle) remain unchanged

// Initialize everything
document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Load components based on current page
  if (document.getElementById("matchesList")) loadMatches();
  if (document.getElementById("notificationsList")) loadNotifications();
  if (document.getElementById("hiresList")) loadHires();
  if (document.getElementById("requiredSkillsSelect"))
    loadSkills("requiredSkillsSelect");

  // Attach job form if exists
  const jobForm = document.getElementById("jobPostForm");
  if (jobForm) jobForm.addEventListener("submit", handleJobPost);
});

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("matchesList")) loadMatches();
  if (document.getElementById("hiresList")) loadHires();
});

// CLIENT: create contract (called from create-contract.html form)
// - Validates inputs
// - Ensures the caller is the client for the hire
// - Ensures the final submission is APPROVED and belongs to the hire
// - Prevents duplicate contracts for the same final_submission_id
// - Inserts contract with status 'pending_details' and notifies freelancer
export async function createContract(
  hireId,
  finalSubmissionId,
  paymentMethod,
  amount
) {
  try {
    // basic validation
    if (!hireId || !finalSubmissionId)
      throw new Error("Missing hireId or finalSubmissionId.");
    if (!paymentMethod) throw new Error("Please select a payment method.");
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0)
      throw new Error("Invalid amount.");

    // get current user
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    if (!user) throw new Error("Not logged in.");

    // fetch hire and verify client ownership & freelancer presence
    const { data: hire, error: hireErr } = await supabase
      .from("hires")
      .select("client_id, freelancer_id")
      .eq("id", hireId)
      .single();
    if (hireErr) throw hireErr;
    if (!hire) throw new Error("Hire not found.");
    if (hire.client_id !== user.id)
      throw new Error("You are not the owner of this hire.");

    // verify final submission exists, belongs to this hire, and is approved by admin
    const { data: finalSub, error: finalErr } = await supabase
      .from("final_submissions")
      .select("id, hire_id, status")
      .eq("id", finalSubmissionId)
      .single();
    if (finalErr) throw finalErr;
    if (!finalSub) throw new Error("Final submission not found.");
    if (finalSub.hire_id !== hireId)
      throw new Error("Final submission does not belong to this hire.");
    if (finalSub.status !== "approved")
      throw new Error(
        "Final submission must be approved by admin before creating a contract."
      );

    // prevent duplicate contract for the same final_submission
    const { data: existing, error: existErr } = await supabase
      .from("contracts")
      .select("id")
      .eq("final_submission_id", finalSubmissionId)
      .limit(1)
      .maybeSingle();
    if (existErr) throw existErr;
    if (existing)
      throw new Error("A contract already exists for this final submission.");

    // insert contract (status waiting for freelancer to provide per-contract details)
    const { data: created, error: insertErr } = await supabase
      .from("contracts")
      .insert([
        {
          hire_id: hireId,
          final_submission_id: finalSubmissionId,
          client_id: user.id,
          freelancer_id: hire.freelancer_id,
          payment_method: paymentMethod,
          total_amount: parseFloat(amount),
          status: "pending_details",
        },
      ])
      .select("id, hire_id, freelancer_id")
      .single();

    if (insertErr) throw insertErr;

    // notify freelancer to provide payment details for this contract
    await supabase.from("notifications").insert({
      user_id: created.freelancer_id,
      type: "action",
      message: `Client created contract ${created.id}. Please provide payment receiving details for this contract.`,
    });

    // return the created contract minimal info
    return created;
  } catch (err) {
    // rethrow so caller can show user-friendly message
    console.error("createContract error:", err);
    throw err;
  }
}

export async function markPaymentSent(contractId, proofFile = null) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  // Verify contract exists and client owns it
  const { data: contract, error: contErr } = await supabase
    .from("contracts")
    .select("client_id, freelancer_id")
    .eq("id", contractId)
    .single();
  if (contErr) throw contErr;
  if (contract.client_id !== user.id) throw new Error("Not authorized");

  // Check freelancer provided payment details
  const { data: details, error: detailsErr } = await supabase
    .from("contract_payment_details")
    .select("*")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (detailsErr || !details) {
    throw new Error(
      "Freelancer has not provided payment receiving details yet."
    );
  }

  // Upload proof if provided
  let proofUrl = null;
  if (proofFile) {
    const path = `contract-proofs/${contractId}/${Date.now()}-${
      proofFile.name
    }`;
    const { error: upErr } = await supabase.storage
      .from("proofs")
      .upload(path, proofFile);
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage
      .from("proofs")
      .getPublicUrl(path);
    proofUrl = urlData.publicUrl;
  }

  // Update contract
  const { error } = await supabase
    .from("contracts")
    .update({
      client_marked_sent: true,
      proof_url: proofUrl,
      status: "payment_sent",
    })
    .eq("id", contractId);

  if (error) throw error;

  // notify freelancer & admin
  await supabase.from("notifications").insert([
    {
      user_id: contract.freelancer_id,
      type: "payment",
      message: `Client marked payment sent for contract ${contractId}.`,
    },
  ]);

  const { data: admins } = await supabase
    .from("users")
    .select("id")
    .eq("role", "admin");
  for (const a of admins || []) {
    await supabase.from("notifications").insert({
      user_id: a.id,
      type: "payment",
      message: `Client marked payment sent for contract ${contractId}. Please review proof and confirm.`,
    });
  }

  return true;
}

async function loadClientSummary() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return;

  try {
    // 1️⃣ Fetch client info with wallet data
    const { data: client, error: clientError } = await supabase
      .from("users")
      .select("full_name, coin_balance, account_number")
      .eq("id", user.id)
      .single();

    if (clientError) throw clientError;

    // 2️⃣ Calculate total spent from coin transactions (outgoing payments)
    const { data: payments, error: paymentsError } = await supabase
      .from("coin_transactions")
      .select("amount")
      .eq("from_user_id", user.id)
      .in("type", ['payment', 'milestone_payment', 'transfer']);

    if (paymentsError) throw paymentsError;

    // 3️⃣ Calculate active projects (hires that aren't fully completed)
    const { data: activeHires, error: hiresError } = await supabase
      .from("hires")
      .select(`
        id,
        job_id,
        jobs(
          payment_type,
          milestones(status)
        )
      `)
      .eq("client_id", user.id);

    if (hiresError) throw hiresError;

    // 4️⃣ Calculate coin holds (funds reserved for active work)
    const { data: coinHolds, error: holdsError } = await supabase
      .from("coin_holds")
      .select("amount")
      .eq("client_id", user.id)
      .in("status", ["held", "disputed"]);

    if (holdsError) throw holdsError;

    // Calculate metrics
    const totalSpent = payments?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0;
    const totalHolds = coinHolds?.reduce((sum, hold) => sum + (hold.amount || 0), 0) || 0;

    // Count active projects
    let activeProjectsCount = 0;
    activeHires?.forEach(hire => {
      if (hire.jobs.payment_type === 'milestone') {
        const milestones = hire.jobs.milestones || [];
        const allApproved = milestones.every(m => m.status === 'approved');
        if (!allApproved) {
          activeProjectsCount++;
        }
      } else {
        // For single payment jobs, check if payment was released
        // If there are active coin holds, it's still active
        const hasActiveHolds = coinHolds?.some(hold => 
          hold.amount > 0 && (hold.status === 'held' || hold.status === 'disputed')
        );
        if (hasActiveHolds) {
          activeProjectsCount++;
        }
      }
    });

    // 5️⃣ Render into DOM
    const updateElement = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };

    updateElement("clientName", client.full_name);
    updateElement("coinBalance", `${client.coin_balance || 0} TN`);
    updateElement("totalSpent", `${totalSpent.toLocaleString()} TN`);
    updateElement("activeProjects", activeProjectsCount);
    updateElement("coinHolds", `${totalHolds.toLocaleString()} TN`);
    updateElement("accountNumber", client.account_number || "Not set");

  } catch (error) {
    console.error("Error loading client summary:", error);
    
    // Show error states
    const updateElement = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };

    updateElement("clientName", "Error loading");
    updateElement("coinBalance", "Error");
    updateElement("totalSpent", "Error");
    updateElement("activeProjects", "Error");
    updateElement("coinHolds", "Error");
  }
}

// 🔥 Run on page load
document.addEventListener("DOMContentLoaded", () => {
  loadClientSummary();
});

// Theme Toggle Functionality
function initThemeToggle() {
  const themeToggle = document.getElementById("themeToggle");
  if (!themeToggle) return;

  const themeIcon = themeToggle.querySelector(".theme-icon");
  const themeLabel = themeToggle.querySelector(".theme-label");

  // Check for saved theme or prefer-color-scheme
  const savedTheme = localStorage.getItem("client-theme");
  const prefersLight = window.matchMedia(
    "(prefers-color-scheme: light)"
  ).matches;

  if (savedTheme === "light" || (!savedTheme && prefersLight)) {
    document.documentElement.setAttribute("data-theme", "light");
    themeIcon.textContent = "🌙";
    themeLabel.textContent = "Dark Mode";
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    themeIcon.textContent = "☀️";
    themeLabel.textContent = "Light Mode";
  }

  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");

    if (currentTheme === "light") {
      document.documentElement.setAttribute("data-theme", "dark");
      themeIcon.textContent = "☀️";
      themeLabel.textContent = "Light Mode";
      localStorage.setItem("client-theme", "dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      themeIcon.textContent = "🌙";
      themeLabel.textContent = "Dark Mode";
      localStorage.setItem("client-theme", "light");
    }
  });
}

// Initialize theme toggle when DOM loads
document.addEventListener("DOMContentLoaded", () => {
  initThemeToggle();
});


// Load verification banner
async function loadVerificationBanner() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  
  if (authError || !user) return;

  const { data: userData, error } = await supabase
    .from("users")
    .select("id_verified, gov_id_path, id_rejection_reason")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Error loading user data:", error);
    return;
  }

  const banner = document.getElementById("verificationBanner");
  const verifyBtn = document.getElementById("verifyNowBtn");
  const closeBtn = document.getElementById("closeBanner");

  // Show banner if not verified
  if (!userData.id_verified) {
    banner.style.display = 'block';
    
    // Set banner state based on verification status
    if (userData.gov_id_path) {
      if (userData.id_rejection_reason) {
        // ID was rejected
        banner.classList.add('rejected');
        document.querySelector('.banner-text h3').textContent = 'ID Verification Rejected';
        document.querySelector('.banner-text p').textContent = `Reason: ${userData.id_rejection_reason}. Please upload a new ID.`;
        verifyBtn.textContent = 'Upload New ID';
      } else {
        // ID uploaded, pending approval
        banner.classList.add('pending');
        document.querySelector('.banner-text h3').textContent = 'Verification Pending';
        document.querySelector('.banner-text p').textContent = 'Your ID is under review. We\'ll notify you once verified.';
        verifyBtn.textContent = 'View Status';
      }
    } else {
      // No ID uploaded yet
      banner.classList.remove('pending', 'rejected');
      document.querySelector('.banner-text h3').textContent = 'Complete ID Verification';
      document.querySelector('.banner-text p').textContent = 'Verify your identity to unlock all platform features';
      verifyBtn.textContent = 'Verify Now';
    }

    // Handle verify button click
    verifyBtn.onclick = () => {
      window.location.href = 'settings.html';
    };

    // Handle close button click
    closeBtn.onclick = () => {
      banner.style.display = 'none';
      // Optional: Store dismissal in localStorage to not show again for X time
      localStorage.setItem('bannerDismissed', Date.now().toString());
    };
  } else {
    // User is verified - hide banner
    banner.style.display = 'none';
  }
}

// Optional: Check if user recently dismissed the banner
function shouldShowBanner() {
  const dismissed = localStorage.getItem('bannerDismissed');
  if (!dismissed) return true;
  
  const dismissedTime = parseInt(dismissed);
  const now = Date.now();
  const hoursSinceDismissal = (now - dismissedTime) / (1000 * 60 * 60);
  
  // Show banner again after 24 hours
  return hoursSinceDismissal > 24;
}

// Initialize banner when page loads
document.addEventListener("DOMContentLoaded", async () => {
  if (shouldShowBanner()) {
    await loadVerificationBanner();
  }
});