(function () {
  "use strict";

  const passwordInput = document.querySelector("#password");
  const togglePassword = document.querySelector("#togglePassword");
  const toast = document.querySelector("#toast");
  const toastMessage = document.querySelector("#toastMessage");
  const usernameInput = document.querySelector("#username");
  const usernameError = document.querySelector("#usernameError");
  const passwordError = document.querySelector("#passwordError");
  const form = document.querySelector("#loginForm");
  const loginBtn = document.querySelector("#loginBtn");

  // ============================================================
  // ===== تنظیمات API و مسیر پنل‌ها =====
  // ============================================================
  // آدرس API مستقل از صفحه‌ای است که کاربر در آن قرار دارد.
  const API_BASE_URL = "http://localhost:3000/api";

  const API = {
    auth: `${API_BASE_URL}/auth`,
    management: `${API_BASE_URL}/management`,
    user: `${API_BASE_URL}/user`,
    admin: `${API_BASE_URL}/admin`,
  };

  // مسیر فایل شروع هر پنل را متناسب با پروژه‌ی خودت تغییر بده.
  const PANEL_ROUTES = {
    management: "management/index.html",
    user: "user/index.html",
    admin: "admin/index.html",
  };

  // ============================================================
  // ===== ابزارهای عمومی =====
  // ============================================================
  function showToast(message, type = "success") {
    if (!toast || !toastMessage) return;

    toast.className = "toast " + type;
    toastMessage.textContent = message;
    toast.style.animation = "none";

    setTimeout(() => {
      toast.style.animation = "";
      toast.classList.add("show");
    }, 10);

    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => {
      toast.classList.remove("show");
    }, 4000);
  }

  function clearAuthStorage() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userPanel");
    localStorage.removeItem("sessionStart");
  }

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }

  function getPanelFromUser(user) {
    // نام panel را از پاسخ API می‌خوانیم.
    // role فقط fallback است؛ بهتر است بک‌اند مقدار panel را صریح برگرداند.
    const panel = String(
      user?.panel || user?.panel_type || user?.panelName || "",
    ).toLowerCase();

    if (["management", "manage", "manager"].includes(panel)) {
      return "management";
    }

    if (["admin", "administrator"].includes(panel)) {
      return "admin";
    }

    if (["user", "کاربر"].includes(panel)) {
      return "user";
    }

    const role = String(user?.role || "").toLowerCase();

    if (["admin", "administrator"].includes(role)) {
      return "admin";
    }

    if (["manager", "management"].includes(role)) {
      return "management";
    }

    return "user";
  }

  function redirectToPanel(user) {
    const panel = getPanelFromUser(user);
    const route = PANEL_ROUTES[panel];

    if (!route) {
      throw new Error("برای پنل کاربر مسیر تعریف نشده است");
    }

    localStorage.setItem("userPanel", panel);
    window.location.replace(route);
  }

  // ============================================================
  // ===== وارپر مرکزی تمام درخواست‌های API =====
  // ============================================================
  async function apiFetch(path, options = {}) {
    const token = localStorage.getItem("authToken");
    const headers = new Headers(options.headers || {});

    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }

    headers.set("Accept", "application/json");

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(path, {
      ...options,
      headers,
    });

    let data = {};
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch {
        data = {};
      }
    } else {
      data = { message: await response.text() };
    }

    if (response.status === 401) {
      clearAuthStorage();

      if (!window.location.pathname.endsWith("login.html")) {
        window.location.replace("login.html");
      }

      throw new Error(data.message || "نشست شما منقضی شده است");
    }

    if (response.status === 403) {
      throw new Error(
        data.message || "شما اجازه‌ی دسترسی به این بخش را ندارید",
      );
    }

    if (!response.ok) {
      throw new Error(data.message || "خطا در ارتباط با سرور");
    }

    return data;
  }

  // این سه wrapper در صفحات پنل‌ها هم قابل استفاده هستند.
  // مدیریت و کاربر به صفحه وابسته نیستند؛ admin namespace مخصوص پنل ادمین است.
  const managementApi = (path, options = {}) =>
    apiFetch(`${API.management}${path}`, options);

  const userApi = (path, options = {}) =>
    apiFetch(`${API.user}${path}`, options);

  const adminApi = (path, options = {}) =>
    apiFetch(`${API.admin}${path}`, options);

  // برای استفاده در فایل‌های دیگر، در صورت نیاز wrapperها را در دسترس قرار می‌دهیم.
  window.appApi = {
    apiFetch,
    managementApi,
    userApi,
    adminApi,
  };

  // ============================================================
  // ===== ورود کاربر =====
  // ============================================================
  async function loginUser(username, password) {
    const data = await apiFetch(`${API.auth}/login`, {
      method: "POST",
      body: JSON.stringify({
        personnel_no: username,
        password,
      }),
    });

    const accessToken = data.access_token || data.token;
    const user = data.user;

    if (!accessToken || !user) {
      throw new Error("پاسخ API ورود ناقص است");
    }

    localStorage.setItem("authToken", accessToken);
    localStorage.setItem("user", JSON.stringify(user));

    if (data.refresh_token) {
      localStorage.setItem("refreshToken", data.refresh_token);
    }

    if (user.role) {
      localStorage.setItem("userRole", user.role);
    }

    localStorage.setItem("userPanel", getPanelFromUser(user));
    localStorage.setItem("sessionStart", Date.now().toString());

    return data;
  }

  // ============================================================
  // ===== اعتبارسنجی فرم =====
  // ============================================================
  function validateField(input, errorEl, message) {
    const value = input.value.trim();

    if (!value) {
      input.classList.add("error");
      errorEl.classList.add("show");

      const errorText = errorEl.querySelector("span");
      if (errorText) errorText.textContent = message;

      return false;
    }

    input.classList.remove("error");
    errorEl.classList.remove("show");
    return true;
  }

  function clearFieldError(input, errorEl) {
    if (input.value.trim()) {
      input.classList.remove("error");
      errorEl.classList.remove("show");
    }
  }

  // ============================================================
  // ===== رویدادهای فرم =====
  // ============================================================
  if (usernameInput && usernameError) {
    usernameInput.addEventListener("input", () => {
      clearFieldError(usernameInput, usernameError);
    });
  }

  if (passwordInput && passwordError) {
    passwordInput.addEventListener("input", () => {
      clearFieldError(passwordInput, passwordError);
    });
  }

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      const icon = this.querySelector("i");
      if (!icon) return;
      if (passwordInput.type === "password") {
        passwordInput.type = "text";
        this.querySelector("i").classList.remove("fa-eye");
        this.querySelector("i").classList.add("fa-eye-slash");
      } else {
        passwordInput.type = "password";
        this.querySelector("i").classList.remove("fa-eye-slash");
        this.querySelector("i").classList.add("fa-eye");
      }
      // const passwordIsHidden = passwordInput.type === "password";
      // passwordInput.type = passwordIsHidden ? "text" : "password";

      // const icon = togglePassword.querySelector("i");

      // if (icon) {
      //   icon.classList.remove("fa-eye", "fa-eye-slash");
      //   icon.classList.add(passwordIsHidden ? "fa-eye-slash" : "fa-eye");
      // }
      // const type =
      //   passwordInput.getAttribute("type") === "password" ? "text" : "password";

      // passwordInput.setAttribute("type", type);

      // const icon = togglePassword.querySelector("i");
      // if (icon) {
      //   icon.className.type === "password" ? "fas fa-eye" : "fas fa-eye-slash";
      // }
    });
  }

  if (form && loginBtn) {
    // به جای click از submit استفاده می‌کنیم تا Enter نیز به‌درستی کار کند.
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const isUsernameValid = validateField(
        usernameInput,
        usernameError,
        "لطفاً نام کاربری را وارد کنید",
      );

      const isPasswordValid = validateField(
        passwordInput,
        passwordError,
        "لطفاً پسورد را وارد کنید",
      );

      if (!isUsernameValid || !isPasswordValid) {
        showToast("لطفاً تمام فیلدهای ضروری را پر کنید", "error");
        return;
      }

      loginBtn.disabled = true;
      loginBtn.classList.add("loading");

      try {
        const username = usernameInput.value.trim();
        // رمز عبور را trim نمی‌کنیم تا فاصله‌ی معتبر انتهای رمز حذف نشود.
        const password = passwordInput.value;
        const responseData = await loginUser(username, password);

        showToast("ورود موفق! در حال انتقال...", "success");

        setTimeout(() => {
          redirectToPanel(responseData.user);
        }, 500);
      } catch (error) {
        console.error("Login error:", error);
        showToast(error.message || "ورود ناموفق بود", "error");
        loginBtn.disabled = false;
        loginBtn.classList.remove("loading");
      }
    });
  }

  // ============================================================
  // ===== بررسی نشست قبلی =====
  // ============================================================
  function checkExistingSession() {
    const token = localStorage.getItem("authToken");
    const user = getStoredUser();

    if (token && user) {
      redirectToPanel(user);
    }
  }

  function addBubble() {
    if (!document.querySelector(".bubble-3")) {
      const bubble = document.createElement("div");
      bubble.className = "bubble-3";
      document.body.appendChild(bubble);
    }
  }

  addBubble();
  checkExistingSession();
})();
