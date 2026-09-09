// ===== API WRAPPER با پشتیبانی از چند سرویس =====
(function () {
  // آدرس پایه اصلی سرور
  const API_BASE_URL = "http://localhost:8080";

  // تعریف مسیر هر سرویس (فقط path، بدون دامنه)
  // مثال: API_BASE_URL + SERVICES.auth + "/login" => http://localhost:8080/auth/login
  const SERVICES = {
    profile: "/profile",
    myReports: "/report/myReports",
    newreports: "/reports",

    // مسیرهای دارای شناسه
    editereport: "/reports/{id}",
    deletereports: "/reports/{id}",

    myDepartments: "/myDepartments",
    departments: "/departments",
    testapi: "/reports/check",

    // ===== سرویس احراز هویت =====
    auth: "/auth",
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

    put(service, endpoint, body, options = {}) {
      return this.request(service, endpoint, {
        ...options,
        method: "PUT",
        body: JSON.stringify(body),
      });
    },

    delete(service, endpoint, options = {}) {
      return this.request(service, endpoint, {
        ...options,
        method: "DELETE",
      });
    },

    putAbsolute(url, body, options = {}) {
      return this.requestAbsolute(url, {
        ...options,
        method: "PUT",
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

      if (response.status === 401) {
        this.clearToken();
        window.dispatchEvent(new CustomEvent("unauthorized"));
        throw new Error("جلسه شما منقضی شده است");
      }

      return response;
    },

    deleteAbsolute(url, options = {}) {
      return this.requestAbsolute(url, {
        ...options,
        method: "DELETE",
      });
    },

    // ===== متدهای راحت برای هر سرویس =====
    reports: {
      getAll: () => {
        return window.API.get("myReports", "");
      },
      getOne: (id) => {
        if (id === null || id === undefined || id === "") {
          throw new Error("شناسه گزارش برای دریافت جزئیات مشخص نشده است");
        }
        const endpoint = SERVICES.editereport.replace(
          "{id}",
          encodeURIComponent(id),
        );
        const url = `${API_BASE_URL}${endpoint}`;
        return window.API.requestAbsolute(url, { method: "GET" });
      },
      create: (data) => {
        return window.API.post("newreports", "", data);
      },
      update: (id, data) => {
        if (id === null || id === undefined || id === "") {
          throw new Error("شناسه گزارش برای ویرایش مشخص نشده است");
        }
        const endpoint = SERVICES.editereport.replace(
          "{id}",
          encodeURIComponent(id),
        );
        const url = `${API_BASE_URL}${endpoint}`;
        return window.API.putAbsolute(url, data);
      },
      delete: (id) => {
        if (id === null || id === undefined || id === "") {
          throw new Error("شناسه گزارش برای حذف مشخص نشده است");
        }
        const endpoint = SERVICES.deletereports.replace(
          "{id}",
          encodeURIComponent(id),
        );
        const url = `${API_BASE_URL}${endpoint}`;
        return window.API.deleteAbsolute(url);
      },
    },

    departments: {
      getAll: () => window.API.get("departments", ""),
      getOne: (id) => window.API.get("departments", `/${id}`),
      create: (data) => window.API.post("departments", "", data),
      update: (id, data) => window.API.put("departments", `/${id}`, data),
      delete: (id) => window.API.delete("departments", `/${id}`),
    },

    // ===== سرویس احراز هویت =====
    // API.auth => API_BASE_URL + "/auth"
    // مثال: window.API.auth.login(data) => POST /auth/login
    auth: {
      login: (data) => window.API.post("auth", "/login", data),
      register: (data) => window.API.post("auth", "/register", data),
      logout: () => window.API.post("auth", "/logout", {}),
      profile: () => window.API.get("auth", "/profile"),
    },

    testapi: {
      check: () => window.API.get("testapi", ""),
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

  // ===== ارسال فرم لاگین =====
  loginForm?.addEventListener("submit", async function (e) {
    e.preventDefault();

    if (!validateForm()) {
      showToastMessage("لطفاً تمامی فیلدها را پر کنید", true);
      return;
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> درحال ورود...';

    try {
      const loginData = {
        username: usernameInput.value.trim(),
        password: passwordInput.value.trim(),
      };

      const response = await window.API.auth.login(loginData);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `خطا: ${response.status}`);
      }

      const data = await response.json();

      if (data.token) {
        window.API.setToken(data.token);
        document.cookie = `authToken=${data.token};path=/;SameSite=Lax;max-age=7200`;
        // استخراج نقش از jwt
        const payload = parseJwt(data.token);
        const userRole = payload?.role || payload?.authorities?.[0] || "user";
        console.log("نقش کاربر", userRole);
        showToastMessage("ورود موفق ✅", false);
        setTimeout(() => {
          const roleRoutes = {
            admin: "/admin-panel",
            manager: "/manager-panel",
            user: "/user-panel",
            ADMIN: "/admin",
            MANAGER: "/management",
            USER: "/user",
          };
          const redirectUrl = roleRoutes[userRole] || "/dashboard";
          window.location.replace(redirectUrl);
        }, 1500);
      } else {
        throw new Error("توکن یافت نشد");
      }
    } catch (error) {
      console.error("❌ خطای لاگین:", error);
      showToastMessage(error.message || "خطای نامشخص در لاگین", true);
    } finally {
      loginBtn.disabled = false;
      loginBtn.innerHTML = "ورود";
    }
  });

  console.log("✅ مدیریت فرم لاگین فعال شد");
})();

// ===== تابع نمایش Toast =====
function showToastMessage(msg, isError = false) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  const toastMessage = document.getElementById("toastMessage");
  toastMessage.textContent = msg;

  toast.className = "toast show" + (isError ? " error" : "");

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
}

// ===== مدیریت نشست (Session Management) =====
(function () {
  const SESSION_DURATION = 2 * 60 * 60 * 1000; // ۲ ساعت
  let sessionTimer = null;
  let warningTimer = null;

  function startSessionTimer() {
    clearTimeout(sessionTimer);
    clearTimeout(warningTimer);

    sessionTimer = setTimeout(() => {
      window.API.clearToken();
      document.cookie =
        "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
      window.dispatchEvent(new CustomEvent("unauthorized"));
      showToastMessage("⏰ مدت زمان جلسه شما به پایان رسید.", true);
      setTimeout(() => {
        window.location.replace("/login");
      }, 1500);
    }, SESSION_DURATION);
  }

  function resetSessionTimer() {
    const token = window.API.getToken();
    if (token) {
      startSessionTimer();
    }
  }

  const activityEvents = [
    "click",
    "keydown",
    "scroll",
    "mousemove",
    "touchstart",
    "keyup",
  ];
  activityEvents.forEach((event) => {
    document.addEventListener(event, resetSessionTimer);
  });

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
    clearTimeout(warningTimer);
  };

  if (window.API.getToken()) {
    startSessionTimer();
  }

  window.addEventListener("unauthorized", function () {
    window.API.clearToken();
    // حذف کوکی
    document.cookie =
      "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
    sessionStorage.clear(); // ✅ پاک کردن داده‌های جلسه

    showToastMessage("جلسه شما منقضی شد. لطفاً دوباره وارد شوید.", true);
    setTimeout(() => {
      window.location.replace("/login");
    }, 1500);
  });

  console.log("✅ مدیریت نشست فعال شد (۲ ساعت)");
})();
