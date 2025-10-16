import { supabase } from "../../supabase/config.js";

document.addEventListener("DOMContentLoaded", loadWalletData);

async function loadWalletData() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    alert("You must be logged in to view your wallet.");
    window.location.href = "login.html";
    return;
  }

  try {
    // Load user data
    await loadUserInfo(user.id);
    
    // Load wallet balance and stats
    await loadWalletBalance(user.id);
    
    // Load transaction history
    await loadTransactionHistory(user.id);
    
    // Setup transfer functionality if user is freelancer
    await setupTransferFunctionality(user.id);

  } catch (error) {
    console.error("Error loading wallet data:", error);
    alert("Error loading wallet data. Please try again.");
  }
}

async function loadUserInfo(userId) {
  const { data: userData, error } = await supabase
    .from("users")
    .select("full_name, role, account_number")
    .eq("id", userId)
    .single();

  if (error) throw error;

  // Display user info
  document.getElementById("fullName").textContent = userData.full_name;
  document.getElementById("accountType").textContent = userData.role === 'freelancer' ? 'Freelancer' : 'Client';
  document.getElementById("displayAccountNumber").textContent = userData.account_number;
  document.getElementById("accountNumber").textContent = userData.account_number;
}

async function loadWalletBalance(userId) {
  const { data: userData, error } = await supabase
    .from("users")
    .select("coin_balance, frozen_balance, role")
    .eq("id", userId)
    .single();

  if (error) throw error;

  // Display available balance
  const availableBalance = userData.coin_balance || 0;
  document.getElementById("availableBalance").textContent = `${availableBalance} TN`;

  // Show/hide sections based on user role
  if (userData.role === 'freelancer') {
    // Show frozen balance for freelancers
    const frozenBalance = userData.frozen_balance || 0;
    document.getElementById("frozenBalanceCard").style.display = 'block';
    document.getElementById("frozenBalance").textContent = `${frozenBalance} TN`;
  } else if (userData.role === 'client') {
    // Show coin holds for clients
    await loadClientCoinHolds(userId);
  }
}

async function loadClientCoinHolds(clientId) {
  const { data: coinHolds, error } = await supabase
    .from("coin_holds")
    .select("amount")
    .eq("client_id", clientId)
    .in("status", ["held", "disputed"]);

  if (error) throw error;

  const totalHolds = coinHolds.reduce((sum, hold) => sum + (hold.amount || 0), 0);
  
  document.getElementById("coinHoldsCard").style.display = 'block';
  document.getElementById("coinHolds").textContent = `${totalHolds} TN`;
}

async function loadTransactionHistory(userId) {
  const container = document.getElementById("transactionsList");
  container.innerHTML = "<div class='loading'>Loading transactions...</div>";

  const { data: transactions, error } = await supabase
    .from("coin_transactions")
    .select("*")
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error loading transactions:", error);
    container.innerHTML = "<p class='error'>Error loading transactions.</p>";
    return;
  }

  if (!transactions || transactions.length === 0) {
    container.innerHTML = "<p>No transactions yet.</p>";
    return;
  }

  // Create transactions table
  let tableHTML = `
    <table class="transactions-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Amount</th>
          <th>Balance After</th>
        </tr>
      </thead>
      <tbody>
  `;

  transactions.forEach(transaction => {
    const isOutgoing = transaction.from_user_id === userId;
    const isIncoming = transaction.to_user_id === userId;
    
    let amountDisplay = '';
    let amountClass = '';
    let description = '';
    
    if (isOutgoing && isIncoming) {
      // This shouldn't happen with our new logic, but handle it
      amountDisplay = `0 TN`;
      amountClass = '';
      description = 'Self-transfer';
    } else if (isOutgoing) {
      // User sent money
      amountDisplay = `-${transaction.amount} TN`;
      amountClass = 'amount-negative';
      description = `Sent to ${transaction.to_user_name || 'user'}`;
    } else if (isIncoming) {
      // User received money  
      amountDisplay = `+${transaction.amount} TN`;
      amountClass = 'amount-positive';
      description = `Received from ${transaction.from_user_name || 'user'}`;
    }
    
    // For incoming transactions, we don't have balance_after stored, so calculate it
    let balanceAfter = transaction.balance_after;
    if (isIncoming && !balanceAfter) {
      // We could fetch the user's balance at that time, but for now show N/A
      balanceAfter = 'N/A';
    }

    tableHTML += `
      <tr>
        <td>${new Date(transaction.created_at).toLocaleDateString()}</td>
        <td>${description}</td>
        <td class="${amountClass}">${amountDisplay}</td>
        <td>${balanceAfter} TN</td>
      </tr>
    `;
  });

  tableHTML += `
      </tbody>
    </table>
  `;

  container.innerHTML = tableHTML;
}

function getTransactionDescription(transaction, userId) {
  const isIncoming = transaction.to_user_id === userId;
  
  if (transaction.type === 'transfer') {
    return isIncoming ? 
      `Received from ${transaction.from_user_name || 'user'}` :
      `Sent to ${transaction.to_user_name || 'user'}`;
  } else if (transaction.type === 'payment') {
    return isIncoming ?
      `Payment for work` :
      `Payment for services`;
  } else if (transaction.type === 'purchase') {
    return `Coin purchase`;
  } else if (transaction.type === 'release') {
    return `Funds released`;
  } else {
    return transaction.note || 'Transaction';
  }
}

async function setupTransferFunctionality(userId) {
  const { data: userData, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  if (error) throw error;

  // Only show transfer section for freelancers
  if (userData.role === 'freelancer') {
    document.getElementById("transferSection").style.display = 'block';
    
    // Setup recipient account number lookup
    const recipientInput = document.getElementById("recipientAccount");
    recipientInput.addEventListener("input", debounce(async (e) => {
      await lookupRecipient(e.target.value);
    }, 500));

    // Setup transfer form submission
    document.getElementById("transferForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      await initiateTransfer(userId);
    });

    // Setup cancel transfer
    document.getElementById("cancelTransfer").addEventListener("click", () => {
      document.getElementById("transferForm").reset();
      document.getElementById("recipientPreview").style.display = 'none';
    });
  }
}

async function lookupRecipient(accountNumber) {
  const preview = document.getElementById("recipientPreview");
  const recipientName = document.getElementById("recipientName");
  
  if (!accountNumber || accountNumber.length < 3) {
    preview.style.display = 'none';
    return;
  }

  try {
    const { data: recipient, error } = await supabase
      .from("users")
      .select("full_name, role, id")
      .eq("account_number", accountNumber)
      .eq("role", "freelancer") // Only allow transfers to freelancers
      .single();

    if (error || !recipient) {
      preview.style.display = 'block';
      recipientName.textContent = "User not found or not eligible for transfers";
      recipientName.style.color = "var(--error-color)";
      return;
    }

    preview.style.display = 'block';
    recipientName.textContent = recipient.full_name;
    recipientName.style.color = "var(--success-color)";

  } catch (error) {
    console.error("Error looking up recipient:", error);
    preview.style.display = 'block';
    recipientName.textContent = "Error looking up user";
    recipientName.style.color = "var(--error-color)";
  }
}

async function initiateTransfer(userId) {
  const recipientAccount = document.getElementById("recipientAccount").value;
  const transferAmount = parseFloat(document.getElementById("transferAmount").value);
  const transferNote = document.getElementById("transferNote").value;

  // Validation
  if (!recipientAccount) {
    alert("Please enter recipient account number.");
    return;
  }

  if (!transferAmount || transferAmount <= 0) {
    alert("Please enter a valid amount.");
    return;
  }

  // Get recipient details
  const { data: recipient, error: recipientError } = await supabase
    .from("users")
    .select("id, full_name, coin_balance")
    .eq("account_number", recipientAccount)
    .eq("role", "freelancer")
    .single();

  if (recipientError || !recipient) {
    alert("Recipient not found or not eligible for transfers.");
    return;
  }

  // Get sender current balance
  const { data: sender, error: senderError } = await supabase
    .from("users")
    .select("coin_balance, full_name")
    .eq("id", userId)
    .single();

  if (senderError) {
    alert("Error verifying your balance.");
    return;
  }

  if (sender.coin_balance < transferAmount) {
    alert("Insufficient balance for this transfer.");
    return;
  }

  // Show confirmation modal
  showTransferConfirmation({
    recipientName: recipient.full_name,
    recipientAccount: recipientAccount,
    amount: transferAmount,
    note: transferNote,
    senderName: sender.full_name,
    senderBalance: sender.coin_balance
  });
}

function showTransferConfirmation(transferDetails) {
  const modal = document.getElementById("confirmModal");
  const content = document.getElementById("confirmContent");
  
  content.innerHTML = `
    <p>Please confirm this transfer:</p>
    <div class="transfer-details">
      <p><strong>From:</strong> ${transferDetails.senderName}</p>
      <p><strong>To:</strong> ${transferDetails.recipientName} (${transferDetails.recipientAccount})</p>
      <p><strong>Amount:</strong> ${transferDetails.amount} TN</p>
      <p><strong>Note:</strong> ${transferDetails.note || 'No note'}</p>
      <p><strong>Your balance after transfer:</strong> ${transferDetails.senderBalance - transferDetails.amount} TN</p>
    </div>
    <p class="form-help">This action cannot be undone.</p>
  `;

  // Setup confirm button
  const confirmBtn = document.getElementById("confirmTransfer");
  confirmBtn.onclick = () => executeTransfer(transferDetails);

  modal.style.display = 'block';
}

async function executeTransfer(transferDetails) {
  const confirmBtn = document.getElementById("confirmTransfer");
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '🔄 Processing...';

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be logged in.");

    // Execute the transfer via RPC function
    const { data, error } = await supabase.rpc('transfer_coins', {
      from_user_id: user.id,
      to_account_number: transferDetails.recipientAccount,
      amount: transferDetails.amount,
      note: transferDetails.note
    });

    if (error) throw error;

    // Success
    alert("✅ Transfer completed successfully!");
    document.getElementById("confirmModal").style.display = 'none';
    document.getElementById("transferForm").reset();
    document.getElementById("recipientPreview").style.display = 'none';
    
    // Reload wallet data
    loadWalletData();

  } catch (error) {
    console.error("Transfer error:", error);
    alert("❌ Transfer failed: " + error.message);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = 'Confirm Transfer';
  }
}

// Utility function for debouncing
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}