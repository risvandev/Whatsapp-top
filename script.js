document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const authCard = document.getElementById('authCard');
  const authTitle = document.getElementById('authTitle');
  const authSubtitle = document.getElementById('authSubtitle');
  
  // Step Containers
  const stepDetails = document.getElementById('stepDetails');
  const stepOtp = document.getElementById('stepOtp');
  const stepSuccess = document.getElementById('stepSuccess');
  
  // Forms & Inputs
  const formDetails = document.getElementById('formDetails');
  const inputName = document.getElementById('inputName');
  const selectCountry = document.getElementById('selectCountry');
  const inputMobile = document.getElementById('inputMobile');
  
  const formOtp = document.getElementById('formOtp');
  const otpDigits = document.querySelectorAll('.otp-digit');
  
  // Buttons
  const btnSendOtp = document.getElementById('btnSendOtp');
  const btnVerifyOtp = document.getElementById('btnVerifyOtp');
  const btnBack = document.getElementById('btnBack');
  const btnResend = document.getElementById('btnResend');
  const btnReset = document.getElementById('btnReset');
  
  // Validation Messages
  const errorName = document.getElementById('errorName');
  const errorMobile = document.getElementById('errorMobile');
  const errorOtp = document.getElementById('errorOtp');
  
  // Success state
  const displayName = document.getElementById('displayName');
  const userAvatar = document.getElementById('userAvatar');
  const userAvatarFallback = document.getElementById('userAvatarFallback');
  
  // Toast elements
  const demoToast = document.getElementById('demoToast');
  const toastOtp = document.getElementById('toastOtp');
  const btnToastClose = document.getElementById('btnToastClose');

  // WhatsApp QR pairing overlay elements
  const qrOverlay = document.getElementById('qrOverlay');
  const qrImage = document.getElementById('qrImage');
  const qrSpinner = document.getElementById('qrSpinner');
  const qrStatus = document.getElementById('qrStatus');
  const qrSuccessMark = document.getElementById('qrSuccessMark');

  // Dispatcher live status elements (bot-profile block)
  const botProfileConnected = document.getElementById('botProfileConnected');
  const botProfilePlaceholder = document.getElementById('botProfilePlaceholder');
  const botProfileAvatar = document.getElementById('botProfileAvatar');
  const botProfileAvatarFallback = document.getElementById('botProfileAvatarFallback');
  const botProfileNumber = document.getElementById('botProfileNumber');

  // Application State
  let sessionToken = '';
  let resendTimer = null;
  let resendSeconds = 30;
  let generatedOtpForLocalFallback = ''; // Fallback for local preview without backend
  
  // Validation helper flags
  let isSubmittingDetails = false;
  let isSubmittingOtp = false;

  // Supported countries and validation rules
  const COUNTRIES = [
    { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', minLength: 10, maxLength: 10, placeholder: '9876543210', pattern: /^[6-9]\d{9}$/ },
    { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', minLength: 10, maxLength: 10, placeholder: '2015550123', pattern: /^\d{10}$/ },
    { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', minLength: 9, maxLength: 10, placeholder: '7700900077', pattern: /^7\d{9}$|^[1-9]\d{8,9}$/ },
    { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪', minLength: 9, maxLength: 9, placeholder: '501234567', pattern: /^5\d{8}$/ },
    { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦', minLength: 9, maxLength: 9, placeholder: '501234567', pattern: /^5\d{8}$/ },
    { code: 'QA', name: 'Qatar', dialCode: '+974', flag: '🇶🇦', minLength: 8, maxLength: 8, placeholder: '55123456', pattern: /^[3567]\d{7}$/ },
    { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦', minLength: 10, maxLength: 10, placeholder: '6135550123', pattern: /^\d{10}$/ },
    { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺', minLength: 9, maxLength: 9, placeholder: '412345678', pattern: /^4\d{8}$/ },
    { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪', minLength: 10, maxLength: 11, placeholder: '1512345678', pattern: /^1[5-7]\d{8,9}$/ }
  ];

  /* ==========================================================================
     Navigation & Transitions
     ========================================================================== */
  function transitionStep(fromStep, toStep, titleText, subtitleText) {
    // Add slide-out class to current active step
    fromStep.classList.remove('active');
    fromStep.classList.add('slide-out');
    
    setTimeout(() => {
      fromStep.classList.remove('slide-out');
      fromStep.style.display = 'none';
      
      // Update Titles with soft transition
      authTitle.textContent = titleText;
      authSubtitle.textContent = subtitleText;
      
      // Prepare and activate next step
      toStep.style.display = 'block';
      toStep.classList.add('active');
    }, 350); // Matches CSS transition duration
  }

  /* ==========================================================================
     Input Validation
     ========================================================================== */
  function validateName() {
    const value = inputName.value.trim();
    if (value.length < 2) {
      inputName.closest('.input-group').classList.add('invalid');
      errorName.style.display = 'block';
      return false;
    }
    inputName.closest('.input-group').classList.remove('invalid');
    errorName.style.display = 'none';
    return true;
  }

  function validateMobile() {
    const country = COUNTRIES.find(c => c.code === selectCountry.value);
    if (!country) return false;

    const value = inputMobile.value.trim();
    const cleaned = value.replace(/[\s\-\(\)]/g, '').replace(/^0+/, '');

    const isValid = cleaned.length >= country.minLength && 
                    cleaned.length <= country.maxLength && 
                    country.pattern.test(cleaned);

    if (!isValid) {
      inputMobile.closest('.input-group').classList.add('invalid');
      errorMobile.style.display = 'block';
      errorMobile.textContent = `Please enter a valid mobile number for ${country.name} (e.g. ${country.placeholder})`;
      return false;
    }

    inputMobile.closest('.input-group').classList.remove('invalid');
    errorMobile.style.display = 'none';
    return true;
  }

  // Clear errors on input
  inputName.addEventListener('input', () => {
    inputName.closest('.input-group').classList.remove('invalid');
    errorName.style.display = 'none';
  });

  inputMobile.addEventListener('input', () => {
    inputMobile.closest('.input-group').classList.remove('invalid');
    errorMobile.style.display = 'none';
  });

  selectCountry.addEventListener('change', () => {
    inputMobile.closest('.input-group').classList.remove('invalid');
    errorMobile.style.display = 'none';
    updateMobilePlaceholder();
  });

  function updateMobilePlaceholder() {
    const country = COUNTRIES.find(c => c.code === selectCountry.value);
    if (country) {
      inputMobile.placeholder = country.placeholder;
    }
  }

  function initCountries() {
    selectCountry.innerHTML = COUNTRIES.map(c => 
      `<option value="${c.code}">${c.flag} ${c.dialCode}</option>`
    ).join('');
    selectCountry.value = 'IN';
    updateMobilePlaceholder();
  }

  // Populate countries dropdown
  initCountries();

  /* ==========================================================================
     Step 1: Submit Details & Request OTP
     ========================================================================== */
  formDetails.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmittingDetails) return;

    const isNameValid = validateName();
    const isMobileValid = validateMobile();

    if (!isNameValid || !isMobileValid) return;

    isSubmittingDetails = true;
    btnSendOtp.classList.add('loading');

    const name = inputName.value.trim();
    const country = COUNTRIES.find(c => c.code === selectCountry.value);
    const cleanedMobile = inputMobile.value.trim().replace(/[\s\-\(\)]/g, '').replace(/^0+/, '');
    const mobile = `${country.dialCode}${cleanedMobile}`;

    try {
      // Attempt backend API call
      const response = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mobile })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (data.demoMode) {
          sessionToken = 'local-demo-token';
          generatedOtpForLocalFallback = data.otp;
          showToast(data.otp);
        } else {
          sessionToken = 'production-api';
          showToast(null); // Show "Sent to WhatsApp" notification
        }
      } else {
        throw new Error(data.message || 'API request failed');
      }
    } catch (err) {
      console.warn('Backend API unavailable. Falling back to local demo mode.', err);
      // Fallback local logic for demo/static hosting environments
      const localOtp = Math.floor(100000 + Math.random() * 900000).toString();
      generatedOtpForLocalFallback = localOtp;
      sessionToken = 'local-demo-token';
      showToast(localOtp);
    } finally {
      // Complete loading and transition
      btnSendOtp.classList.remove('loading');
      isSubmittingDetails = false;
      
      transitionStep(
        stepDetails,
        stepOtp,
        "Verify Passcode",
        `We've sent a 6-digit confirmation code to ${mobile}`
      );
      
      startResendTimer();
      setTimeout(() => otpDigits[0].focus(), 400);
    }
  });

  /* ==========================================================================
     Step 2: OTP Multi-input Grid Handling
     ========================================================================== */
  otpDigits.forEach((digitInput, index) => {
    // Focus next digit on numeric key entry
    digitInput.addEventListener('input', (e) => {
      const val = e.target.value;
      
      if (val) {
        digitInput.classList.add('filled');
        if (index < otpDigits.length - 1) {
          otpDigits[index + 1].focus();
        }
      } else {
        digitInput.classList.remove('filled');
      }

      // Automatically trigger form submit if all fields are filled
      if (getEnteredOtp().length === 6) {
        verifyOtpSubmit();
      }
    });

    // Handle Backspace / Arrow navigation
    digitInput.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (!digitInput.value && index > 0) {
          otpDigits[index - 1].value = '';
          otpDigits[index - 1].classList.remove('filled');
          otpDigits[index - 1].focus();
        } else {
          digitInput.value = '';
          digitInput.classList.remove('filled');
        }
        errorOtp.style.display = 'none';
      } else if (e.key === 'ArrowLeft' && index > 0) {
        otpDigits[index - 1].focus();
      } else if (e.key === 'ArrowRight' && index < otpDigits.length - 1) {
        otpDigits[index + 1].focus();
      }
    });

    // Handle Paste events
    digitInput.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedData = (e.clipboardData || window.clipboardData).getData('text');
      const numericString = pastedData.replace(/\D/g, '').substring(0, 6);
      
      if (numericString) {
        for (let i = 0; i < numericString.length; i++) {
          if (otpDigits[i]) {
            otpDigits[i].value = numericString[i];
            otpDigits[i].classList.add('filled');
          }
        }
        const focusIndex = Math.min(numericString.length, 5);
        otpDigits[focusIndex].focus();

        if (numericString.length === 6) {
          verifyOtpSubmit();
        }
      }
    });
  });

  function getEnteredOtp() {
    let code = '';
    otpDigits.forEach(input => code += input.value);
    return code;
  }

  function clearOtpInputs() {
    otpDigits.forEach(input => {
      input.value = '';
      input.classList.remove('filled');
    });
    otpDigits[0].focus();
  }

  // Back to step 1
  btnBack.addEventListener('click', () => {
    clearInterval(resendTimer);
    clearOtpInputs();
    errorOtp.style.display = 'none';
    transitionStep(
      stepOtp,
      stepDetails,
      "Secure Verification",
      "Enter your details to request a secure one-time passcode."
    );
  });

  /* ==========================================================================
     Verify OTP Code Logic
     ========================================================================== */
  formOtp.addEventListener('submit', (e) => {
    e.preventDefault();
    verifyOtpSubmit();
  });

  async function verifyOtpSubmit() {
    if (isSubmittingOtp) return;
    
    const otp = getEnteredOtp();
    if (otp.length !== 6) {
      errorOtp.textContent = 'Please enter all 6 digits.';
      errorOtp.style.display = 'block';
      return;
    }

    isSubmittingOtp = true;
    btnVerifyOtp.classList.add('loading');
    errorOtp.style.display = 'none';

    const mobile = inputMobile.value.trim();

    try {
      if (sessionToken === 'local-demo-token') {
        // Local simulation fallback verification
        await new Promise(resolve => setTimeout(resolve, 800)); // Network simulation delay
        if (otp === generatedOtpForLocalFallback) {
          showSuccessState();
        } else {
          throw new Error('Incorrect OTP');
        }
      } else {
        // Production Serverless verification
        const response = await fetch('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobile, otp, token: sessionToken })
        });
        const data = await response.json();

        if (response.ok && data.success) {
          showSuccessState();
        } else {
          throw new Error(data.message || 'Verification failed');
        }
      }
    } catch (err) {
      // Highlight digit boxes on error
      otpDigits.forEach(digit => {
        digit.style.borderColor = 'var(--text-error)';
        digit.style.boxShadow = '0 0 0 4px rgba(239, 68, 68, 0.15)';
      });
      
      errorOtp.textContent = err.message || 'Incorrect passcode. Please try again.';
      errorOtp.style.display = 'block';
      
      setTimeout(() => {
        otpDigits.forEach(digit => {
          digit.style.borderColor = '';
          digit.style.boxShadow = '';
        });
        clearOtpInputs();
      }, 1000);
    } finally {
      btnVerifyOtp.classList.remove('loading');
      isSubmittingOtp = false;
    }
  }

  async function showSuccessState() {
    clearInterval(resendTimer);
    const name = inputName.value.trim() || 'User';
    displayName.textContent = name;
    hideToast();
    
    // Set fallback avatar initials
    userAvatarFallback.textContent = name.charAt(0).toUpperCase();
    userAvatarFallback.style.display = 'flex';
    userAvatar.style.display = 'none';
    
    transitionStep(
      stepOtp,
      stepSuccess,
      "Signed In",
      "Your authentication was verified successfully."
    );

    // Fetch user profile picture asynchronously
    const mobile = inputMobile.value.trim();
    if (sessionToken !== 'local-demo-token' && mobile) {
      try {
        const response = await fetch(`/api/profile-pic?mobile=${encodeURIComponent(mobile)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.profilePicUrl) {
            userAvatar.src = data.profilePicUrl;
            userAvatar.onload = () => {
              userAvatarFallback.style.display = 'none';
              userAvatar.style.display = 'block';
            };
          }
        }
      } catch (e) {
        console.warn('Could not fetch user profile picture:', e);
      }
    }
  }

  /* ==========================================================================
     Countdown Timer Logic for Resend
     ========================================================================== */
  function startResendTimer() {
    clearInterval(resendTimer);
    resendSeconds = 30;
    btnResend.disabled = true;
    btnResend.innerHTML = `Resend in <span id="timerVal">${resendSeconds}</span>s`;
    
    resendTimer = setInterval(() => {
      resendSeconds--;
      const timerVal = document.getElementById('timerVal');
      if (timerVal) timerVal.textContent = resendSeconds;
      
      if (resendSeconds <= 0) {
        clearInterval(resendTimer);
        btnResend.disabled = false;
        btnResend.textContent = 'Resend OTP';
      }
    }, 1000);
  }

  btnResend.addEventListener('click', async () => {
    if (btnResend.disabled) return;
    
    btnResend.disabled = true;
    btnResend.textContent = 'Sending...';
    
    const name = inputName.value.trim();
    const mobile = inputMobile.value.trim();

    try {
      if (sessionToken === 'local-demo-token') {
        await new Promise(resolve => setTimeout(resolve, 600));
        const localOtp = Math.floor(100000 + Math.random() * 900000).toString();
        generatedOtpForLocalFallback = localOtp;
        showToast(localOtp);
      } else {
        const response = await fetch('/api/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mobile })
        });
        const data = await response.json();
        if (response.ok && data.success) {
          if (data.demoMode) {
            sessionToken = 'local-demo-token';
            generatedOtpForLocalFallback = data.otp;
            showToast(data.otp);
          } else {
            sessionToken = 'production-api';
            showToast(null);
          }
        } else {
          throw new Error('API Resend failed');
        }
      }
    } catch (e) {
      console.warn('API error during resend, falling back to local resend.', e);
      const localOtp = Math.floor(100000 + Math.random() * 900000).toString();
      generatedOtpForLocalFallback = localOtp;
      showToast(localOtp);
    } finally {
      startResendTimer();
    }
  });

  /* ==========================================================================
     Sign Out / Reset Logic
     ========================================================================== */
  btnReset.addEventListener('click', () => {
    formDetails.reset();
    formOtp.reset();
    clearOtpInputs();
    
    transitionStep(
      stepSuccess,
      stepDetails,
      "Secure Verification",
      "Enter your details to request a secure one-time passcode."
    );
  });

  /* ==========================================================================
     Toast Notifications (Demo simulation)
     ========================================================================== */
  let toastTimeout = null;

  function showToast(otp) {
    const toastTitle = demoToast.querySelector('.toast-title');
    const toastBody = demoToast.querySelector('.toast-body');

    if (otp) {
      // Demo mode: show SMS popup with code
      toastTitle.textContent = "SMS Simulation";
      toastBody.innerHTML = `Your WhatsApp OTP verification code is: <strong id="toastOtp">${otp}</strong>`;
    } else {
      // Production mode: show notification that OTP was sent via WhatsApp
      toastTitle.textContent = "WhatsApp Notification";
      toastBody.innerHTML = "Verification code dispatched to your WhatsApp account.";
    }

    demoToast.classList.add('show');
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      hideToast();
    }, 8000); // Auto-hide notification
  }

  function hideToast() {
    demoToast.classList.remove('show');
  }

  btnToastClose.addEventListener('click', hideToast);

  /* ==========================================================================
     WhatsApp Bot Status Polling & Overlay Control
     ========================================================================== */
  let qrPollInterval = null;
  
  function showBotProfile(botData) {
    botProfilePlaceholder.style.display = 'none';
    botProfileConnected.style.display = 'flex';

    if (botData && botData.profilePicUrl) {
      botProfileAvatar.src = botData.profilePicUrl;
      botProfileAvatar.style.display = 'block';
      botProfileAvatarFallback.style.display = 'none';
    } else {
      botProfileAvatar.style.display = 'none';
      const letter = botData?.name ? botData.name.charAt(0).toUpperCase() : 'W';
      botProfileAvatarFallback.textContent = letter;
      botProfileAvatarFallback.style.display = 'flex';
    }

    // Format the number with a + prefix
    const num = botData?.number ? '+' + botData.number : 'Connected';
    botProfileNumber.textContent = num;
  }

  function hideBotProfile() {
    botProfileConnected.style.display = 'none';
    botProfilePlaceholder.style.display = 'flex';
  }

  async function checkBotStatus() {
    try {
      const response = await fetch('/api/bot-status');
      if (!response.ok) {
        throw new Error('Failed to fetch bot status');
      }
      const data = await response.json();
      
      if (data.status === 'connected') {
        if (qrPollInterval) {
          clearInterval(qrPollInterval);
          qrPollInterval = null;
        }
        
        // Update bot-profile block in the card header
        showBotProfile(data.bot);
        
        if (qrOverlay.classList.contains('active')) {
          qrImage.style.display = 'none';
          qrSpinner.style.display = 'none';
          qrSuccessMark.style.display = 'block';
          qrStatus.innerHTML = '✨ WhatsApp Bot Connected successfully!';
          qrStatus.style.color = '#10b981';
          
          setTimeout(() => {
            qrOverlay.classList.remove('active');
          }, 1500);
        } else {
          qrOverlay.classList.remove('active');
        }
      } else {
        // Show spinner placeholder while not connected
        hideBotProfile();

        if (data.status === 'offline') {
          qrOverlay.classList.add('active');
          qrImage.style.display = 'none';
          qrSpinner.style.display = 'block';
          qrSuccessMark.style.display = 'none';
          qrStatus.textContent = 'Connecting to WhatsApp gateway... (Bot starting up)';
          qrStatus.style.color = '';
        } else {
          qrOverlay.classList.add('active');
          qrSuccessMark.style.display = 'none';
          
          if (data.qr) {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=208x208&margin=0&data=${encodeURIComponent(data.qr)}`;
            
            if (qrImage.src !== qrUrl) {
              qrImage.src = qrUrl;
              qrImage.onload = () => {
                qrSpinner.style.display = 'none';
                qrImage.style.display = 'block';
              };
            }
            qrStatus.textContent = 'Pairing pending. Please scan the QR code.';
            qrStatus.style.color = '';
          } else {
            qrImage.style.display = 'none';
            qrSpinner.style.display = 'block';
            qrStatus.textContent = 'Generating WhatsApp pairing QR code...';
            qrStatus.style.color = '';
          }
        }
      }
    } catch (error) {
      console.error('Error checking WhatsApp bot status:', error);
      hideBotProfile();
      qrOverlay.classList.add('active');
      qrImage.style.display = 'none';
      qrSpinner.style.display = 'block';
      qrSuccessMark.style.display = 'none';
      qrStatus.textContent = 'Unable to reach backend gateway. Reconnecting...';
      qrStatus.style.color = '#ef4444';
    }
  }

  function initQrPolling() {
    checkBotStatus();
    qrPollInterval = setInterval(checkBotStatus, 2000);
  }

  // Initialize status polling
  initQrPolling();
});
