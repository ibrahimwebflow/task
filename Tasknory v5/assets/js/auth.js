import { supabase } from "../../supabase/config.js";

// Utility: get form data into an object
function formToObject(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

// Handle Freelancer Signup
async function handleFreelancerSignup(event) {
  event.preventDefault();
  const data = formToObject(event.target);

  // 1. Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password
  });

  if (authError) {
    alert("Signup failed: " + authError.message);
    return;
  }

  const userId = authData.user.id;

  // 2. Generate unique account number
  const accountNumber = await generateUniqueAccountNumber();

  // 3. Insert into users table (NO ID REQUIRED INITIALLY)
  const { error: dbError } = await supabase.from("users").insert({
    id: userId,
    email: data.email,
    role: "freelancer",
    full_name: data.full_name,
    tone: data.tone,
    language: data.language || "English",
    verified: false,
    id_verified: false, // NEW: Track ID verification status
    available: false,
    gov_id_path: null, // Will be set later in settings
    account_number: accountNumber,
    coin_balance: 0,
    frozen_balance: 0
  });

  if (dbError) {
    alert("DB insert failed: " + dbError.message);
    return;
  }

  // 4. Insert selected skill IDs
  const skillSelect = document.getElementById("skillsSelect");
  const selectedSkillIds = Array.from(skillSelect.selectedOptions).map(opt => parseInt(opt.value));

  for (let skillId of selectedSkillIds) {
    await supabase.from("freelancer_skills").insert({
      freelancer_id: userId,
      skill_id: skillId,
      verified: false
    });
  }

  alert(`Welcome to Inbit! Your account number is: ${accountNumber}\nPlease complete ID verification in settings to start working.`);
  window.location.href = "../freelancer/dashboard.html"; // Redirect to dashboard, not login
}

// Function to generate unique account number
async function generateUniqueAccountNumber() {
  const prefix = "TN";
  let isUnique = false;
  let accountNumber = '';
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    // Generate random 8-digit number
    const randomNum = Math.floor(10000000 + Math.random() * 90000000);
    accountNumber = `${prefix}${randomNum}`;
    
    // Check if account number already exists
    const { data, error } = await supabase
      .from("users")
      .select("account_number")
      .eq("account_number", accountNumber)
      .single();

    if (error && error.code === 'PGRST116') {
      // PGRST116 means no rows returned - account number is unique!
      isUnique = true;
    } else if (error) {
      console.error("Error checking account number uniqueness:", error);
      attempts++;
      continue;
    } else if (data) {
      // Account number already exists, try again
      attempts++;
      continue;
    } else {
      isUnique = true;
    }
  }

  if (!isUnique) {
    // Fallback: Use timestamp-based account number
    const timestamp = Date.now().toString().slice(-8);
    accountNumber = `${prefix}${timestamp}`;
    
    // Final check for fallback
    const { data } = await supabase
      .from("users")
      .select("account_number")
      .eq("account_number", accountNumber)
      .single();

    if (data) {
      // If still not unique, append random chars
      const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
      accountNumber = `${prefix}${timestamp}${randomChars}`;
    }
  }

  return accountNumber;
}



// Handle Client Signup
async function handleClientSignup(event) {
  event.preventDefault();
  const data = formToObject(event.target);

  // 1. Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
  });

  if (authError) {
    alert("Signup failed: " + authError.message);
    return;
  }

  const user = authData.user;
  if (!user) {
    alert("Signup failed: User not created.");
    return;
  }

  // 2. Generate unique account number
  const accountNumber = await generateUniqueAccountNumber();

  // 3. Insert into users table (NO ID REQUIRED INITIALLY)
  const { error: dbError } = await supabase.from("users").insert({
    id: user.id,
    email: data.email,
    role: "client",
    full_name: data.full_name,
    tone: data.tone,
    language: data.language || "English",
    verified: false,
    id_verified: false, // NEW: Track ID verification status
    business_name: data.account_type === "business" ? data.business_name : null,
    gov_id_path: null, // Will be set later in settings
    account_number: accountNumber,
    coin_balance: 0
  });

  if (dbError) {
    alert("DB insert failed: " + dbError.message);
    return;
  }

  alert(`Welcome to Inbit! Your account number is: ${accountNumber}\nPlease complete ID verification in settings to post jobs.`);
  window.location.href = "../client/dashboard.html"; // Redirect to dashboard, not login
}

// Use the same account number generation function



// Attach listeners
document.addEventListener("DOMContentLoaded", () => {
  const freelancerForm = document.getElementById("freelancerSignupForm");
  if (freelancerForm) freelancerForm.addEventListener("submit", handleFreelancerSignup);

  const clientForm = document.getElementById("clientSignupForm");
  if (clientForm) clientForm.addEventListener("submit", handleClientSignup);
});


// // Utility: get form data
// function formToObject(form) {
//   const data = new FormData(form);
//   return Object.fromEntries(data.entries());
// }

// LOGIN HANDLER (Freelancer)
async function handleFreelancerLogin(event) {
  event.preventDefault();
  const data = formToObject(event.target);

  const { data: loginData, error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password
  });

  if (error) {
    alert("Login failed: " + error.message);
    return;
  }

  // Check user role in DB
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("role, verified")
    .eq("id", loginData.user.id)
    .single();

  if (userError) {
    alert("Error fetching user role: " + userError.message);
    return;
  }

  if (!user.verified) {
    alert("Your account is not yet verified by admin.");
    return;
  }

  if (user.role !== "freelancer") {
    alert("This is not a freelancer account.");
    return;
  }

  window.location.href = "../freelancer/dashboard.html";
}

// LOGIN HANDLER (Client)
async function handleClientLogin(event) {
  event.preventDefault();
  const data = formToObject(event.target);

  const { data: loginData, error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password
  });

  if (error) {
    alert("Login failed: " + error.message);
    return;
  }

  // Check role
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("role, verified")
    .eq("id", loginData.user.id)
    .single();

  if (userError) {
    alert("Error fetching user role: " + userError.message);
    return;
  }

  if (!user.verified) {
    alert("Your account is not yet verified by admin.");
    return;
  }

  if (user.role !== "client") {
    alert("This is not a client account.");
    return;
  }

  window.location.href = "../client/dashboard.html";
}

// Attach listeners
document.addEventListener("DOMContentLoaded", () => {
  // Signup handlers (already written earlier)
  const freelancerForm = document.getElementById("freelancerSignupForm");
  if (freelancerForm) freelancerForm.addEventListener("submit", handleFreelancerSignup);

  const clientForm = document.getElementById("clientSignupForm");
  if (clientForm) clientForm.addEventListener("submit", handleClientSignup);

  // Login handlers
  const freelancerLoginForm = document.getElementById("freelancerLoginForm");
  if (freelancerLoginForm) freelancerLoginForm.addEventListener("submit", handleFreelancerLogin);

  const clientLoginForm = document.getElementById("clientLoginForm");
  if (clientLoginForm) clientLoginForm.addEventListener("submit", handleClientLogin);
});


// Load skills into select
async function loadSkills(selectId) {
  const { data, error } = await supabase.from("skills_master").select("*").order("skill_name");
  if (error) {
    console.error("Error loading skills:", error.message);
    return;
  }

  const select = document.getElementById(selectId);
  data.forEach(skill => {
    const option = document.createElement("option");
    option.value = skill.id;
    option.textContent = skill.skill_name;
    select.appendChild(option);
  });
}

// Attach listeners
document.addEventListener("DOMContentLoaded", () => {
  const freelancerForm = document.getElementById("freelancerSignupForm");
  if (freelancerForm) {
    freelancerForm.addEventListener("submit", handleFreelancerSignup);
    loadSkills("skillsSelect"); // 👈 populate freelancer signup skills
  }

  const clientForm = document.getElementById("clientSignupForm");
  if (clientForm) {
    clientForm.addEventListener("submit", handleClientSignup);
  }

  const freelancerLoginForm = document.getElementById("freelancerLoginForm");
  if (freelancerLoginForm) freelancerLoginForm.addEventListener("submit", handleFreelancerLogin);

  const clientLoginForm = document.getElementById("clientLoginForm");
  if (clientLoginForm) clientLoginForm.addEventListener("submit", handleClientLogin);
});