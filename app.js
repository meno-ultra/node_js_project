const express = require("express");
const app = express();
const port = process.env.PORT || 3001;
const mongoose = require("mongoose");
const Admin = require("./models/adminSchema");
const User = require("./models/customerSchema");
const AuditLog = require("./models/auditLogSchema");
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

app.set("view engine", "ejs");
app.use(express.static("public"));

var methodOverride = require("method-override");
app.use(methodOverride("_method"));
const allRoutes = require("./routes/allRoutes");
const addUserRoute = require("./routes/addUser");

// Auto refresh
const path = require("path");
const livereload = require("livereload");
const liveReloadServer = livereload.createServer();
liveReloadServer.watch(path.join(__dirname, "public"));

const connectLivereload = require("connect-livereload");
app.use(connectLivereload());
const uploadedLogoPath =
  "C:\\Users\\mmahm\\.cursor\\projects\\c-Users-mmahm-OneDrive-Desktop-node-level1-lesson19\\assets\\c__Users_mmahm_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_images__1_-ee183576-854d-4ce5-aeb5-0976bd250694.png";
const AUTH_COOKIE_NAME = "dashboard_auth";
const AUTH_COOKIE_VALUE = "ok";
const AUTH_USER_COOKIE_NAME = "dashboard_user";
const DEFAULT_ADMIN_USERNAME = process.env.DASHBOARD_USERNAME || "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.DASHBOARD_PASSWORD || "123456";

liveReloadServer.server.once("connection", () => {
  setTimeout(() => {
    liveReloadServer.refresh("/");
  }, 100);
});

app.get("/mazen-logo.png", (req, res) => {
  res.sendFile(uploadedLogoPath);
});

const getCookies = (req) => {
  const header = req.headers.cookie;
  if (!header) return {};

  return header.split(";").reduce((acc, item) => {
    const parts = item.split("=");
    const key = parts.shift()?.trim();
    const value = decodeURIComponent(parts.join("="));
    if (key) acc[key] = value;
    return acc;
  }, {});
};

const setAuthCookies = (res, username) => {
  res.cookie(AUTH_COOKIE_NAME, AUTH_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24,
  });
  res.cookie(AUTH_USER_COOKIE_NAME, username, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24,
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie(AUTH_COOKIE_NAME);
  res.clearCookie(AUTH_USER_COOKIE_NAME);
};

const getAuthUsername = (req) => {
  const cookies = getCookies(req);
  if (cookies[AUTH_COOKIE_NAME] !== AUTH_COOKIE_VALUE) {
    return null;
  }
  return cookies[AUTH_USER_COOKIE_NAME] || null;
};

const getAuthenticatedAdmin = async (req) => {
  const username = getAuthUsername(req);
  if (!username) {
    return null;
  }

  return Admin.findOne({ username });
};

const getProfileMessages = (query) => {
  return {
    successMessage:
      query.updated === "1"
        ? "Your account details were updated."
        : query.created === "1"
        ? "New admin account created successfully."
        : query.roleUpdated === "1"
        ? "Admin role updated successfully."
        : query.deleted === "1"
        ? "Admin account removed successfully."
        : null,
    errorMessage:
      query.error === "duplicate"
        ? "Username already exists."
        : query.error === "invalid"
        ? "Please fill all required fields."
        : query.error === "wrong-password"
        ? "Current password is incorrect."
        : query.error === "forbidden"
        ? "You do not have permission for this action."
        : query.error === "self-delete"
        ? "You cannot delete your own active account."
        : null,
  };
};

const getSettingsMessages = (query) => {
  return {
    successMessage:
      query.imported === "1"
        ? `Imported ${query.count || 0} customers successfully.`
        : query.exported === "1"
        ? "CSV export completed."
        : null,
    errorMessage:
      query.error === "import-invalid"
        ? "Please upload a valid CSV file."
        : query.error === "import-failed"
        ? "Could not import CSV."
        : null,
  };
};

const logAuditEvent = async ({
  actorUsername,
  actorRole,
  action,
  targetType,
  targetId = "",
  details = "",
}) => {
  await AuditLog.create({
    actorUsername,
    actorRole,
    action,
    targetType,
    targetId,
    details,
  });
};

const toCsvValue = (value) => {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

const parseCsvLine = (line) => {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current.trim());
  return fields;
};

const parseCustomersCsv = (csvContent) => {
  const rows = csvContent
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);
  if (rows.length < 2) return [];

  const normalizeHeader = (header) =>
    String(header || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const headers = parseCsvLine(rows[0]).map(normalizeHeader);

  const headerAliases = {
    fireName: ["firstname", "name", "givenname", "first"],
    lastName: ["lastname", "surname", "familyname", "last"],
    email: ["email", "emailaddress", "mail"],
    phoneNumber: ["phonenumber", "phone", "telephone", "mobile", "tel"],
    age: ["age", "yearsold"],
    country: ["country", "nation", "location"],
    gender: ["gender", "sex"],
  };

  const findIndex = (aliases) => {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const idx = {
    fireName: findIndex(headerAliases.fireName),
    lastName: findIndex(headerAliases.lastName),
    email: findIndex(headerAliases.email),
    phoneNumber: findIndex(headerAliases.phoneNumber),
    age: findIndex(headerAliases.age),
    country: findIndex(headerAliases.country),
    gender: findIndex(headerAliases.gender),
  };

  const hasAnyMappedHeader = Object.values(idx).some((value) => value >= 0);

  const customers = [];
  for (let i = 1; i < rows.length; i += 1) {
    const values = parseCsvLine(rows[i]);
    const get = (field, fallbackIndex) => {
      if (idx[field] >= 0) return values[idx[field]] || "";
      if (!hasAnyMappedHeader && typeof fallbackIndex === "number") {
        return values[fallbackIndex] || "";
      }
      return "";
    };

    const customer = {
      fireName: get("fireName", 0),
      lastName: get("lastName", 1),
      email: get("email", 2),
      phoneNumber: get("phoneNumber", 3),
      age: Number(get("age", 4)) || 0,
      country: get("country", 5),
      gender: get("gender", 6),
    };

    if (customer.fireName || customer.lastName || customer.email) {
      customers.push(customer);
    }
  }

  return customers;
};

const renderProfilePage = async (req, res) => {
  const messages = getProfileMessages(req.query);
  const isViewer = req.currentAdmin.role === "viewer";
  const admins = isViewer ? [] : await Admin.find().sort({ createdAt: -1 });

  return res.render("admin/profile", {
    currentAdmin: req.currentAdmin,
    admins,
    successMessage: messages.successMessage,
    errorMessage: messages.errorMessage,
  });
};

const renderSettingsPage = async (req, res) => {
  const messages = getSettingsMessages(req.query);
  const isViewer = req.currentAdmin.role === "viewer";
  const logs = isViewer ? [] : await AuditLog.find().sort({ createdAt: -1 }).limit(200);
  return res.render("admin/settings", {
    successMessage: messages.successMessage,
    errorMessage: messages.errorMessage,
    logs,
  });
};

const ensureDefaultAdmin = async () => {
  const exists = await Admin.findOne({ username: DEFAULT_ADMIN_USERNAME });
  if (!exists) {
    await Admin.create({
      username: DEFAULT_ADMIN_USERNAME,
      password: DEFAULT_ADMIN_PASSWORD,
      role: "super-admin",
    });
  }
};

app.get("/login", async (req, res) => {
  const admin = await getAuthenticatedAdmin(req);
  if (admin) {
    return res.redirect("/");
  }

  return res.render("auth/login", { errorMessage: null });
});

app.post("/login", async (req, res) => {
  const username = req.body.username?.trim();
  const password = req.body.password?.trim();

  const admin = await Admin.findOne({ username, password });
  if (admin) {
    setAuthCookies(res, admin.username);
    return res.redirect("/");
  }

  return res.status(401).render("auth/login", {
    errorMessage: "Invalid username or password.",
  });
});

app.get("/logout", (req, res) => {
  clearAuthCookies(res);
  return res.redirect("/login");
});

mongoose
  .connect(
    'mongodb+srv://mazenmahmod397_db_user:jWbv5x3R8JHKMBIE@cluster0.1tusjle.mongodb.net/all-data?appName=Cluster0'
  )
  .then(async () => {
    await ensureDefaultAdmin();
    app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
  })
  .catch((err) => {
    console.log(err);
  });
  

app.use(async (req, res, next) => {
  const publicPaths = ["/login", "/mazen-logo.png"];
  if (publicPaths.includes(req.path)) {
    return next();
  }

  const admin = await getAuthenticatedAdmin(req);
  if (!admin) {
    clearAuthCookies(res);
    return res.redirect("/login");
  }

  req.currentAdmin = admin;
  res.locals.currentAdmin = admin;
  res.locals.isViewer = admin.role === "viewer";
  return next();
});

app.use((req, res, next) => {
  const viewerBlockedPaths = ["/user/add.html"];
  const isViewer = req.currentAdmin.role === "viewer";
  const isViewerBlockedEdit = req.path.startsWith("/edit/");
  const isViewerBlockedProfileAction = req.path.startsWith("/profile/") && req.path !== "/profile/update";
  const isViewerBlockedSettingsAction =
    req.path.startsWith("/settings/") &&
    req.path !== "/settings" &&
    req.path !== "/settings/export/customers.csv";

  if (
    isViewer &&
    (viewerBlockedPaths.includes(req.path) ||
      isViewerBlockedEdit ||
      isViewerBlockedProfileAction ||
      isViewerBlockedSettingsAction)
  ) {
    return res.redirect("/?error=forbidden");
  }

  return next();
});

app.get("/profile", async (req, res) => {
  return renderProfilePage(req, res);
});

app.get("/settings", async (req, res) => {
  return renderSettingsPage(req, res);
});

app.post("/profile/update", async (req, res) => {
  const currentPassword = req.body.currentPassword?.trim();
  const newPassword = req.body.newPassword?.trim();

  if (!currentPassword) {
    return res.redirect("/profile?error=invalid");
  }

  if (currentPassword !== req.currentAdmin.password) {
    return res.redirect("/profile?error=wrong-password");
  }

  const isViewer = req.currentAdmin.role === "viewer";
  if (!newPassword) {
    return res.redirect("/profile?error=invalid");
  }

  if (!isViewer) {
    const username = req.body.username?.trim();
    if (!username) {
      return res.redirect("/profile?error=invalid");
    }

    const existingAdmin = await Admin.findOne({ username });
    if (
      existingAdmin &&
      String(existingAdmin._id) !== String(req.currentAdmin._id)
    ) {
      return res.redirect("/profile?error=duplicate");
    }

    req.currentAdmin.username = username;
  }

  req.currentAdmin.password = newPassword;
  await req.currentAdmin.save();

  setAuthCookies(res, req.currentAdmin.username);
  return res.redirect("/profile?updated=1");
});

app.post("/profile/admins/add", async (req, res) => {
  const canManageAdmins = ["admin", "super-admin"].includes(req.currentAdmin.role);
  if (!canManageAdmins) {
    return res.redirect("/profile?error=forbidden");
  }

  const username = req.body.newUsername?.trim();
  const password = req.body.newPassword?.trim();
  const role = req.body.role?.trim() || "admin";

  if (!username || !password) {
    return res.redirect("/profile?error=invalid");
  }

  const exists = await Admin.findOne({ username });
  if (exists) {
    return res.redirect("/profile?error=duplicate");
  }

  await Admin.create({ username, password, role });
  await logAuditEvent({
    actorUsername: req.currentAdmin.username,
    actorRole: req.currentAdmin.role,
    action: "create",
    targetType: "admin",
    targetId: username,
    details: `Created admin with role ${role}`,
  });
  return res.redirect("/profile?created=1");
});

app.post("/profile/admins/:id/delete", async (req, res) => {
  const canManageAdmins = ["admin", "super-admin"].includes(req.currentAdmin.role);
  if (!canManageAdmins) {
    return res.redirect("/profile?error=forbidden");
  }

  if (String(req.params.id) === String(req.currentAdmin._id)) {
    return res.redirect("/profile?error=self-delete");
  }

  await Admin.deleteOne({ _id: req.params.id });
  await logAuditEvent({
    actorUsername: req.currentAdmin.username,
    actorRole: req.currentAdmin.role,
    action: "delete",
    targetType: "admin",
    targetId: req.params.id,
    details: "Deleted admin account",
  });
  return res.redirect("/profile?deleted=1");
});

app.post("/profile/admins/:id/role", async (req, res) => {
  const canManageAdmins = ["admin", "super-admin"].includes(req.currentAdmin.role);
  if (!canManageAdmins) {
    return res.redirect("/profile?error=forbidden");
  }

  const allowedRoles = ["super-admin", "admin", "manager", "viewer"];
  const role = req.body.role?.trim();
  if (!role || !allowedRoles.includes(role)) {
    return res.redirect("/profile?error=invalid");
  }

  const admin = await Admin.findById(req.params.id);
  if (!admin) {
    return res.redirect("/profile?error=invalid");
  }

  admin.role = role;
  await admin.save();
  await logAuditEvent({
    actorUsername: req.currentAdmin.username,
    actorRole: req.currentAdmin.role,
    action: "update",
    targetType: "admin",
    targetId: req.params.id,
    details: `Changed role to ${role}`,
  });
  return res.redirect("/profile?roleUpdated=1");
});

app.get("/settings/export/customers.csv", async (req, res) => {
  const customers = await User.find().sort({ createdAt: -1 });
  const header = [
    "firstName",
    "lastName",
    "email",
    "phoneNumber",
    "age",
    "country",
    "gender",
  ];
  const lines = [
    header.join(","),
    ...customers.map((customer) =>
      [
        toCsvValue(customer.fireName),
        toCsvValue(customer.lastName),
        toCsvValue(customer.email),
        toCsvValue(customer.phoneNumber),
        toCsvValue(customer.age),
        toCsvValue(customer.country),
        toCsvValue(customer.gender),
      ].join(",")
    ),
  ];

  if (req.currentAdmin.role !== "viewer") {
    await logAuditEvent({
      actorUsername: req.currentAdmin.username,
      actorRole: req.currentAdmin.role,
      action: "export",
      targetType: "customer",
      details: `Exported ${customers.length} customers to CSV`,
    });
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="customers-${Date.now()}.csv"`
  );
  return res.send(lines.join("\n"));
});

app.post("/settings/import/customers", async (req, res) => {
  if (req.currentAdmin.role === "viewer") {
    return res.redirect("/?error=forbidden");
  }

  const content = (req.body.csvContent || "").trim();
  if (!content) {
    return res.redirect("/settings?error=import-invalid");
  }
  const customers = parseCustomersCsv(content);
  if (!customers.length) {
    return res.redirect("/settings?error=import-invalid");
  }

  try {
    const created = await User.insertMany(customers);
    await logAuditEvent({
      actorUsername: req.currentAdmin.username,
      actorRole: req.currentAdmin.role,
      action: "import",
      targetType: "customer",
      details: `Imported ${created.length} customers from CSV`,
    });
    return res.redirect(`/settings?imported=1&count=${created.length}`);
  } catch (err) {
    return res.redirect("/settings?error=import-failed");
  }
});

app.use(allRoutes);
app.use("/user/add.html", addUserRoute);
