// ===== API WRAPPER با پشتیبانی از چند سرویس =====
(function () {
  // آدرس پایه اصلی سرور
  // ⚠️ قبل از production حتماً به آدرس واقعی و https تغییر بده
  const API_BASE_URL = "http://localhost:8080";

  // تعریف مسیر هر سرویس (فقط path، بدون دامنه)
  const SERVICES = {
    profile: "/profile",
  };

  window.API = {
    BASE_URL: API_BASE_URL,
    SERVICES: SERVICES,

    getToken() {
      return localStorage.getItem("authToken") || null;
    },

    setToken(token) {
      localStorage.setItem("authToken", token);
    },

    clearToken() {
      localStorage.removeItem("authToken");
    },

    // ساخت آدرس کامل از روی نام سرویس + endpoint
    buildUrl(service, endpoint = "") {
      const servicePath = SERVICES[service];
      if (servicePath === undefined) {
        throw new Error(`سرویس ${service} تعریف نشده است`);
      }
      return `${API_BASE_URL}${servicePath}${endpoint}`;
    },

    async request(service, endpoint, options = {}) {
      const url = this.buildUrl(service, endpoint);
      return this.requestAbsolute(url, options);
    },

    get(service, endpoint, options = {}) {
      return this.request(service, endpoint, {
        ...options,
        method: "GET",
      });
    },

    post(service, endpoint, body, options = {}) {
      return this.request(service, endpoint, {
        ...options,
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    async requestAbsolute(url, options = {}) {
  const token = this.getToken();

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // 401 مربوط به لاگین، انقضای جلسه نیست
  const isLoginRequest = url.endsWith("/profile/login");

  if (response.status === 401 && !isLoginRequest) {
    this.clearToken();
    window.dispatchEvent(new CustomEvent("unauthorized"));
    throw new Error("جلسه شما منقضی شده است");
  }

  if (response.status === 403) {
    throw new Error("شما دسترسی به این بخش را ندارید");
  }

  if (response.status === 404) {
    throw new Error("منبع مورد نظر یافت نشد");
  }

  return response;
},

    // ===== سرویس احراز هویت =====
    // توجه: ثبت‌نام (register) عمداً حذف شده چون طبق نیازمندی،
    // کاربران/مدیران حق ثبت‌نام یا ویرایش حساب خودشون رو ندارند
    // و این عملیات فقط باید توسط ادمین و از طریق پنل ادمین انجام بشه.
    profile: {
      login: (data) => window.API.post("profile", "/login", data),
      logout: () => window.API.post("profile", "/logout", {}),
      getProfile: () => window.API.get("profile", "/profile"),
    },
  };
})();

// ===== تابع Parsing JWT =====
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("خطای JWT parsing:", error);
    return null;
  }
}

// ===== استخراج نقش کاربر از JWT =====
// سازگار با فرمت استاندارد Spring Security که authorities به شکل
// [{ authority: "ROLE_ADMIN" }] برمی‌گرده، و هم claim ساده‌ی "role"
function extractUserRole(payload) {
  if (!payload) return "USER";

  let rawRole = "USER";

  try {
    if (payload.role) {
      rawRole = payload.role;
    } else if (payload.authorities) {
      if (
        Array.isArray(payload.authorities) &&
        payload.authorities.length > 0
      ) {
        const first = payload.authorities[0];
        rawRole = first?.authority || first || "USER";
      } else if (typeof payload.authorities === "string") {
        rawRole = payload.authorities;
      } else if (payload.authorities.authority) {
        rawRole = payload.authorities.authority;
      }
    }
  } catch (error) {
    console.error("❌ خطا در استخراج نقش:", error);
    rawRole = "USER";
  }

  return String(rawRole)
    .replace(/^ROLE_/, "")
    .toUpperCase();
}

(function () {
  const loginForm = document.getElementById("loginForm");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const togglePassword = document.getElementById("togglePassword");

  const usernameError = document.getElementById("usernameError");
  const passwordError = document.getElementById("passwordError");

  // ===== نمایش/مخفی رمز عبور =====
  if (togglePassword) {
    togglePassword.addEventListener("click", function (e) {
      e.preventDefault();
      const icon = this.querySelector("i");

      if (passwordInput.type === "password") {
        passwordInput.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
      } else {
        passwordInput.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
      }
    });
  }

  // ===== پاک کردن پیام خطا هنگام تایپ =====
  usernameInput?.addEventListener("input", function () {
    usernameError?.classList.remove("show");
  });

  passwordInput?.addEventListener("input", function () {
    passwordError?.classList.remove("show");
  });

  // ===== اعتبارسنجی فرم =====
  function validateForm() {
    let isValid = true;

    if (!usernameInput.value.trim()) {
      usernameError?.classList.add("show");
      isValid = false;
    } else {
      usernameError?.classList.remove("show");
    }

    if (!passwordInput.value.trim()) {
      passwordError?.classList.add("show");
      isValid = false;
    } else {
      passwordError?.classList.remove("show");
    }

    return isValid;
  }

  // نقشه مسیر هر نقش به پنل مربوطه (فقط با یک فرمت یکسان - حروف بزرگ)
  const ROLE_ROUTES = {
    ADMIN: "/admin-panel",
    MANAGER: "/manager-panel",
    USER: "/user-panel",
  };
  function setFormDisabled(disabled) {
    if (usernameInput) usernameInput.disabled = disabled;
    if (passwordInput) passwordInput.disabled = disabled;
    if (loginBtn) loginBtn.disabled = disabled;
  }

  // ===== ارسال فرم لاگین =====
  loginForm?.addEventListener("submit", async function (e) {
    e.preventDefault();

    if (!validateForm()) {
      showToastMessage("لطفاً تمامی فیلدها را پر کنید", true);
      return;
    }

    setFormDisabled(true);
    if (loginBtn) {
      loginBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> درحال ورود...';
    }

    const loginData = {
      username: usernameInput.value.trim(),
      password: passwordInput.value.trim(),
    };

    let response;
    try {
      response = await window.API.profile.login(loginData);
    } catch (networkError) {
      // خطای شبکه (مثلاً سرور در دسترس نیست)
      console.error("❌ خطای شبکه:", networkError);
      showToastMessage(
        "خطا در ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کنید.",
        true,
      );
      setFormDisabled(false);
      if (loginBtn) loginBtn.innerHTML = "ورود";
      return;
    }

    try {
      if (!response.ok) {
        let errorData = {};
        try {
          errorData = await response.json();
        } catch {
          // بدنه پاسخ JSON نبود، از پیام پیش‌فرض استفاده می‌کنیم
        }

        // مدیریت خطاهای خاص بر اساس status code
        if (response.status === 401) {
          throw new Error("نام کاربری یا رمز عبور اشتباه است");
        } else if (response.status === 403) {
          throw new Error("حساب کاربری شما مسدود شده است");
        } else if (response.status === 429) {
          throw new Error("تعداد درخواست‌های شما بیش از حد مجاز است");
        } else {
          throw new Error(errorData.message || `خطا: ${response.status}`);
        }
      }

      const data = await response.json();

      if (!data.token) {
        throw new Error("توکن یافت نشد");
      }

      window.API.setToken(data.token);
      // یادآوری: در سمت Spring Boot ترجیحاً از HttpOnly + Secure cookie
      // برای نگهداری توکن استفاده کنید تا در برابر XSS ایمن‌تر باشد.
      document.cookie = `authToken=${data.token};path=/;SameSite=Lax;max-age=7200`;

      // ===== کد جدید =====
      const payload = parseJwt(data.token);
      const userRole = extractUserRole(payload);

      showToastMessage("ورود موفق ✅", false);

      setTimeout(() => {
        // 1. نرمال‌سازی نقش به حروف بزرگ
        const normalizedRole = userRole.toUpperCase();

        // 2. پیدا کردن مسیر مربوط به نقش
        const redirectUrl = ROLE_ROUTES[normalizedRole];

        // 3. اگر نقش معتبر بود → به پنل برو
        if (redirectUrl) {
          window.location.replace(redirectUrl);
        }
        // 4. اگر نقش نامعتبر بود → توکن را پاک کن و به لاگین برگرد
        else {
          // پاک کردن توکن از localStorage
          window.API.clearToken();

          // پاک کردن توکن از کوکی
          document.cookie =
            "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";

          // نمایش پیام خطا به کاربر
          showToastMessage(
            "نقش کاربری نامعتبر است. لطفاً دوباره وارد شوید.",
            true,
          );

          // بعد از ۱.۵ ثانیه به صفحه لاگین برگرد
          setTimeout(() => {
            window.location.replace("/login");
          }, 1500);
        }
      }, 1500);
    } catch (error) {
      console.error("❌ خطای لاگین:", error);
      showToastMessage(error.message || "خطای نامشخص در لاگین", true);
      setFormDisabled(false);
      setFormDisabled(false);
    }
  });

  console.log("✅ مدیریت فرم لاگین فعال شد");
})();

// ===== تابع نمایش Toast =====
function showToastMessage(msg, isError = false) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  const toastMessage = document.getElementById("toastMessage");
  if (!toastMessage) return;
  toastMessage.textContent = msg;

  toast.className = "toast show" + (isError ? " error" : "");

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}


(function () {
  let sessionTimer = null;

  function getTokenExpiryMs(token) {
    try {
      const payload = parseJwt(token);
      if (!payload || typeof payload.exp !== "number") return null;
      return payload.exp * 1000;
    } catch {
      return null;
    }
  }

  function logoutDueToExpiry() {
    window.API.clearToken();
    document.cookie =
      "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    window.dispatchEvent(new CustomEvent("unauthorized"));
    showToastMessage("⏰ مدت زمان جلسه شما به پایان رسید.", true);
    setTimeout(() => {
      window.location.replace("/login");
    }, 1500);
  }

  function startSessionTimer() {
    clearTimeout(sessionTimer);

    const token = window.API.getToken();
    if (!token) return;

    const expiresAt = getTokenExpiryMs(token);

    // اگر توکن claim انقضا نداشت، fallback به ۲ ساعت از الان
    const remaining = expiresAt ? expiresAt - Date.now() : 2 * 60 * 60 * 1000;

    if (remaining <= 0) {
      logoutDueToExpiry();
      return;
    }

    sessionTimer = setTimeout(logoutDueToExpiry, remaining);
  }

  // اتصال به چرخه‌ی عمر توکن: هر وقت توکن ست یا پاک شد، تایمر به‌روز بشه
  const originalSetToken = window.API.setToken;
  window.API.setToken = function (token) {
    originalSetToken.call(this, token);
    if (token) {
      startSessionTimer();
    }
  };

  const originalClearToken = window.API.clearToken;
  window.API.clearToken = function () {
    originalClearToken.call(this);
    document.cookie =
      "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    clearTimeout(sessionTimer);
  };

  // در صورت رفرش صفحه، زمان باقی‌مانده واقعی از exp محاسبه می‌شه
  // (نه ۲ ساعت کامل جدید)
  if (window.API.getToken()) {
    startSessionTimer();
  }

  window.addEventListener("unauthorized", function () {
    window.API.clearToken();
    document.cookie =
      "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";

    // فقط کلیدهای مرتبط با auth پاک بشه، نه کل sessionStorage
    // (در صورت نیاز کلیدهای دیگه‌ای رو اینجا اضافه کنید)
    // پاک کردن همه کلیدهای مرتبط با احراز هویت
    const authKeys = ["authState", "userData", "userRole"];
    authKeys.forEach((key) => sessionStorage.removeItem(key));
    // یا اگر می‌خواهید همه چیز پاک شود:
    sessionStorage.clear();

    showToastMessage("جلسه شما منقضی شد. لطفاً دوباره وارد شوید.", true);
    setTimeout(() => {
      window.location.replace("/login");
    }, 1500);
  });

  console.log("✅ مدیریت نشست فعال شد (مبتنی بر exp توکن)");
})();