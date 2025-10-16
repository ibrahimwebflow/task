import { supabase } from "../../../supabase/config.js";

// Load client settings on page load
document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();

  document
    .getElementById("clientSettingsForm")
    .addEventListener("submit", saveSettings);

  // Preview profile picture instantly
  document
    .getElementById("profile_picture")
    .addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        document.getElementById("profilePreview").src =
          URL.createObjectURL(file);
      }
    });

  // ID Upload functionality
  document.getElementById("uploadIdBtn").addEventListener("click", async () => {
    await uploadGovernmentID();
  });
});

// Load user data
async function loadSettings() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    alert("You must be logged in");
    return;
  }

  const { data, error } = await supabase
    .from("users")
    .select(`
      full_name, 
      email, 
      language, 
      tone, 
      profile_picture,
      business_name,
      account_number,
      role,
      gov_id_path,
      verified,
      id_verified,
      id_rejection_reason
    `)
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Error loading settings:", error);
    return;
  }

  // Populate form fields
  document.getElementById("full_name").value = data.full_name || "";
  document.getElementById("business_name").value = data.business_name || "";
  document.getElementById("email").value = data.email || "";
  document.getElementById("account_number").value = data.account_number || "";
  document.getElementById("language").value = data.language || "English";
  document.getElementById("tone").value = data.tone || "professional";

  // Load verification status
  await loadVerificationStatus(data);

  // Load profile picture
  const avatar = document.getElementById("profilePreview");
  if (data.profile_picture) {
    const { data: urlData } = supabase.storage
      .from("profile_pictures")
      .getPublicUrl(data.profile_picture);
    avatar.src = urlData.publicUrl;
  } else {
    avatar.src = "../assets/images/default-avatar.png";
  }

  // Update account type display
  const accountTypeDisplay = document.getElementById("accountTypeDisplay");
  if (data.business_name) {
    accountTypeDisplay.innerHTML = `
      <span class="badge business-badge">🏢 Business Account</span>
      <small>${data.business_name}</small>
    `;
  } else {
    accountTypeDisplay.innerHTML = `
      <span class="badge individual-badge">👤 Individual Account</span>
    `;
  }
}

// Load verification status
async function loadVerificationStatus(userData) {
  const statusElement = document.getElementById("verificationStatus");
  const uploadBtn = document.getElementById("uploadIdBtn");
  
  if (userData.id_verified) {
    statusElement.innerHTML = `
      <div class="status-approved">
        <span class="status-icon">✅</span>
        <span class="status-text">Verified & Ready to Post Jobs</span>
      </div>
    `;
    uploadBtn.style.display = 'none';
    document.getElementById("gov_id").style.display = 'none';
  } else if (userData.gov_id_path) {
    statusElement.innerHTML = `
      <div class="status-pending">
        <span class="status-icon">⏳</span>
        <span class="status-text">ID Uploaded - Awaiting Admin Approval</span>
      </div>
    `;
    uploadBtn.disabled = true;
    uploadBtn.textContent = "ID Submitted - Pending Approval";
  } else if (userData.id_rejection_reason) {
    statusElement.innerHTML = `
      <div class="status-rejected">
        <span class="status-icon">❌</span>
        <span class="status-text">ID Rejected: ${userData.id_rejection_reason}</span>
        <small>Please upload a new ID document</small>
      </div>
    `;
  } else {
    statusElement.innerHTML = `
      <div class="status-required">
        <span class="status-icon">📋</span>
        <span class="status-text">ID Verification Required to Post Jobs</span>
        <small>Upload your government ID or business license to get verified</small>
      </div>
    `;
  }
}

// Upload government ID
async function uploadGovernmentID() {
  const fileInput = document.getElementById("gov_id");
  const file = fileInput.files[0];
  
  if (!file) {
    alert("Please select a government ID or business license file to upload.");
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const uploadBtn = document.getElementById("uploadIdBtn");
  uploadBtn.disabled = true;
  uploadBtn.textContent = "Uploading...";

  try {
    // Upload to storage
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage
      .from("id_verifications")
      .upload(path, file);

    if (uploadErr) throw uploadErr;

    // Update user record
    const { error: updateErr } = await supabase
      .from("users")
      .update({ 
        gov_id_path: path,
        id_rejection_reason: null // Clear any previous rejection
      })
      .eq("id", user.id);

    if (updateErr) throw updateErr;

    // Notify admin
    await supabase.from("notifications").insert({
      user_id: null, // admin notification
      type: "verification",
      message: `Client ${user.id} uploaded ID for verification.`
    });

    alert("✅ ID uploaded successfully! Awaiting admin verification.");
    await loadSettings(); // Refresh status

  } catch (error) {
    console.error("ID upload failed:", error);
    alert("ID upload failed: " + error.message);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Upload ID";
  }
}

// Save user data
async function saveSettings(event) {
  event.preventDefault();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const fullName = document.getElementById("full_name").value;
  const businessName = document.getElementById("business_name").value;
  const language = document.getElementById("language").value;
  const tone = document.getElementById("tone").value;
  const profileFile = document.getElementById("profile_picture").files[0];

  let profilePath = null;

  // Upload profile picture if selected
  if (profileFile) {
    const path = `avatars/${user.id}/${Date.now()}-profile.jpg`;
    const { error: uploadErr } = await supabase.storage
      .from("profile_pictures")
      .upload(path, profileFile, { upsert: true });

    if (uploadErr) {
      console.error("Upload failed:", uploadErr.message);
      alert("Profile picture upload failed: " + uploadErr.message);
      return;
    }

    profilePath = path;
  }

  // Update database
  const updateData = {
    full_name: fullName,
    business_name: businessName,
    language,
    tone,
  };
  if (profilePath) updateData.profile_picture = profilePath;

  const { error } = await supabase
    .from("users")
    .update(updateData)
    .eq("id", user.id);

  if (error) {
    alert("Update failed: " + error.message);
    return;
  }

  alert("Settings updated successfully!");
  await loadSettings(); // Reload to show updated data
}