import { supabase } from "../../../supabase/config.js";

document.addEventListener("DOMContentLoaded", loadFees);

async function loadFees() {
  const { data: { user } } = await supabase.auth.getUser();
  const container = document.getElementById("feesList");
  
  if (!user) {
    container.innerHTML = "<p class='error'>Login required.</p>";
    return;
  }

  // Show loading state
  container.innerHTML = "<div class='loading'>Loading your fees...</div>";

  const { data, error } = await supabase
    .from("platform_fees")
    .select("id, contract_id, fee_amount, status, proof_url, created_at")
    .eq("freelancer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    container.innerHTML = "<p class='error'>Error loading fees. Please try again.</p>";
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No Fees Found</h3>
        <p>You don't have any platform fees at the moment.</p>
      </div>
    `;
    return;
  }

  // Show admin methods first
  await loadAdminPaymentMethods();

  // Render fees
  container.innerHTML = '<div class="fees-container"></div>';
  const feesContainer = container.querySelector('.fees-container');

  data.forEach((fee) => {
    const feeCard = document.createElement("div");
    feeCard.className = "fee-card";
    feeCard.setAttribute("data-status", fee.status);
    
    const statusClass = `status-${fee.status.replace('_', '-')}`;
    
    let actions = "";
    if (fee.status !== "paid") {
      actions = `
        <div class="upload-section">
          <h4>Upload Payment Proof</h4>
          <div class="upload-controls">
            <div class="file-input-wrapper">
              <input type="file" id="file-${fee.id}" accept=".jpg,.jpeg,.png,.pdf,.doc,.docx" />
            </div>
            <button class="btn-upload" data-id="${fee.id}">Upload Proof</button>
          </div>
        </div>
      `;
    } else {
      actions = `<p class="success-message"><b>✅ Fee cleared</b></p>`;
    }

    feeCard.innerHTML = `
      <div class="fee-info">
        <div class="fee-info-item">
          <span class="fee-info-label">Contract ID</span>
          <span class="fee-info-value">${fee.contract_id}</span>
        </div>
        <div class="fee-info-item">
          <span class="fee-info-label">Amount Due</span>
          <span class="fee-info-value fee-amount">$${Number(fee.fee_amount).toFixed(2)}</span>
        </div>
        <div class="fee-info-item">
          <span class="fee-info-label">Status</span>
          <span class="status-badge ${statusClass}">${fee.status.replace('_', ' ')}</span>
        </div>
        <div class="fee-info-item">
          <span class="fee-info-label">Created</span>
          <span class="fee-info-value">${new Date(fee.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      
      ${fee.proof_url ? `
        <p>
          <a href="${fee.proof_url}" target="_blank" class="proof-link">
            View Uploaded Proof
          </a>
        </p>
      ` : ''}
      
      ${actions}
      
      <div class="action-buttons">
        ${fee.status !== "paid" ? `
          <button class="btn-upload" data-id="${fee.id}">Upload Proof</button>
        ` : ''}
      </div>
    `;

    feesContainer.appendChild(feeCard);
  });

  // Add event listeners
  document.querySelectorAll(".btn-upload").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const feeId = e.target.dataset.id;
      const fileInput = document.getElementById(`file-${feeId}`);
      const file = fileInput?.files[0];
      
      if (!file) {
        alert("Please select a file before uploading.");
        return;
      }
      
      await uploadFeeProof(feeId, file);
    });
  });
}

async function loadAdminPaymentMethods() {
  const { data: methods, error } = await supabase
    .from("admin_payment_methods")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }
  
  if (!methods || methods.length === 0) return;

  const container = document.getElementById("feesList");
  const methodsHTML = document.createElement("div");
  methodsHTML.className = "payment-methods";
  
  methodsHTML.innerHTML = "<h3>Pay Platform Fee — Admin Payment Methods</h3><div class='methods-grid'></div>";
  const methodsGrid = methodsHTML.querySelector('.methods-grid');

  methods.forEach((method) => {
    const methodCard = document.createElement("div");
    methodCard.className = "method-card";
    
    let detailsHtml = "";
    if (method.type === "bank") {
      const d = method.details;
      detailsHtml = `
        <div class="method-header">
          <h4 class="method-type">Bank Transfer</h4>
          <span class="method-label">${method.label}</span>
        </div>
        <div class="method-details">
          <p><strong>Bank:</strong> ${d.bank_name}</p>
          <p><strong>Account Number:</strong> ${d.account_number}</p>
          <p><strong>Account Name:</strong> ${d.account_name}</p>
          ${d.swift ? `<p><strong>SWIFT:</strong> ${d.swift}</p>` : ''}
        </div>
      `;
    } else if (method.type === "crypto") {
      const d = method.details;
      detailsHtml = `
        <div class="method-header">
          <h4 class="method-type">Cryptocurrency</h4>
          <span class="method-label">${method.label}</span>
        </div>
        <div class="method-details">
          <p><strong>Network:</strong> ${d.network}</p>
          <p><strong>Address:</strong> <code id="addr-${method.id}">${d.address}</code></p>
          <button class="copy-btn" data-copy="${method.id}">Copy Address</button>
        </div>
      `;
    } else if (method.type === "link") {
      const d = method.details;
      detailsHtml = `
        <div class="method-header">
          <h4 class="method-type">Payment Link</h4>
          <span class="method-label">${method.label}</span>
        </div>
        <div class="method-details">
          <a href="${d.url}" target="_blank" class="btn-upload">Pay via Link</a>
        </div>
      `;
    }
    
    const instructions = method.instructions ? 
      `<div class="method-instructions">${method.instructions}</div>` : '';
    
    methodCard.innerHTML = `${detailsHtml}${instructions}`;
    methodsGrid.appendChild(methodCard);
  });

  container.parentNode.insertBefore(methodsHTML, container);

  // Copy functionality
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-copy");
      const addrEl = document.getElementById(`addr-${id}`);
      
      if (addrEl) {
        try {
          await navigator.clipboard.writeText(addrEl.textContent);
          e.target.textContent = "Copied!";
          e.target.classList.add("copied");
          
          setTimeout(() => {
            e.target.textContent = "Copy Address";
            e.target.classList.remove("copied");
          }, 2000);
        } catch (err) {
          alert("Failed to copy address. Please copy manually.");
        }
      }
    });
  });
}

async function uploadFeeProof(feeId, file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { 
    alert("Please login to upload proof."); 
    return; 
  }

  // Upload file
  const path = `fee-proofs/${feeId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("proofs")
    .upload(path, file);
    
  if (uploadError) { 
    alert("Upload failed: " + uploadError.message); 
    return; 
  }

  const { data: urlData } = supabase.storage.from("proofs").getPublicUrl(path);
  const proofUrl = urlData.publicUrl;

  // Update fee record
  const { error: updateError } = await supabase
    .from("platform_fees")
    .update({ 
      proof_url: proofUrl, 
      status: "pending_verification" 
    })
    .eq("id", feeId);

  if (updateError) { 
    console.error(updateError); 
    alert("Failed to save proof."); 
    return; 
  }

  // Notify admins
  const { data: admins } = await supabase.from("users").select("id").eq("role", "admin");
  for (const admin of admins || []) {
    await supabase.from("notifications").insert({
      user_id: admin.id,
      type: "action",
      message: `Freelancer uploaded fee proof for fee ${feeId}. Please verify.`
    });
  }

  alert("Proof uploaded successfully! Waiting for admin verification.");
  window.location.reload();
}


