const User = require("../models/customerSchema");
const AuditLog = require("../models/auditLogSchema");
var moment = require("moment");

const buildSearchFilter = (rawQuery) => {
  const query = (rawQuery || "").trim();
  if (!query) {
    return {};
  }

  const regex = new RegExp(query, "i");
  const normalizedQuery = query.toLowerCase();
  const genderExactRegex =
    normalizedQuery === "male" || normalizedQuery === "female"
      ? new RegExp(`^${normalizedQuery}$`, "i")
      : null;
  const orConditions = [
    { fireName: regex },
    { lastName: regex },
    { email: regex },
    { phoneNumber: regex },
    { country: regex },
    { gender: genderExactRegex || regex },
  ];

  const numericValue = Number(query);
  if (!Number.isNaN(numericValue)) {
    orConditions.push({ age: numericValue });
  }

  return { $or: orConditions };
};

const user_index_get = (req, res) => {
  // result ==> array of objects
  console.log("--------------------------------------------");
  User.find()
    .then((result) => {
      res.render("index", { arr: result, moment: moment });
    })
    .catch((err) => {
      console.log(err);
    });
};

const user_edit_get = (req, res) => {
  User.findById(req.params.id)
    .then((result) => {
      res.render("user/edit", { obj: result, moment: moment });
    })
    .catch((err) => {
      console.log(err);
    });
};

const user_view_get = (req, res) => {
  // result ==> object
  User.findById(req.params.id)
    .then((result) => {
      res.render("user/view", { obj: result, moment: moment });
    })
    .catch((err) => {
      console.log(err);
    });
};

const buildSort = (sortBy, order) => {
  const allowed = new Set([
    "fireName",
    "lastName",
    "gender",
    "country",
    "age",
    "createdAt",
    "updatedAt",
  ]);
  const field = allowed.has(sortBy) ? sortBy : "updatedAt";
  const dir = String(order).toLowerCase() === "asc" ? 1 : -1;
  return { [field]: dir };
};

const user_search_post = (req, res) => {
  console.log("*******************************");

  const searchText = req.body.searchText?.trim() || "";
  const filter = buildSearchFilter(searchText);
  User.find(filter)
    .sort({ updatedAt: -1 })
    .then((result) => {
      console.log(result);
      res.render("user/search", { arr: result, moment: moment });
    })
    .catch((err) => {
      console.log(err);
    });
};

const user_search_live_get = (req, res) => {
  const query = (req.query.q || "").trim();
  const sort = buildSort(req.query.sortBy, req.query.order);
  if (!query) {
    return User.find()
      .sort(sort)
      .limit(50)
      .then((result) => {
        const payload = result.map((item) => ({
          _id: item._id,
          fireName: item.fireName,
          lastName: item.lastName,
          gender: item.gender,
          country: item.country,
          age: item.age,
          updatedAtFromNow: moment(item.updatedAt).fromNow(),
        }));
        res.json(payload);
      })
      .catch(() => res.status(500).json([]));
  }

  const filter = buildSearchFilter(query);
  return User.find(filter)
    .sort(sort)
    .limit(50)
    .then((result) => {
      const payload = result.map((item) => ({
        _id: item._id,
        fireName: item.fireName,
        lastName: item.lastName,
        gender: item.gender,
        country: item.country,
        age: item.age,
        updatedAtFromNow: moment(item.updatedAt).fromNow(),
      }));
      res.json(payload);
    })
    .catch(() => res.status(500).json([]));
};

const user_delete = (req, res) => {
  User.deleteOne({ _id: req.params.id })
    .then(async (result) => {
      await AuditLog.create({
        actorUsername: req.currentAdmin.username,
        actorRole: req.currentAdmin.role,
        action: "delete",
        targetType: "customer",
        targetId: req.params.id,
        details: "Customer removed",
      });
      res.redirect("/?success=deleted");
      console.log(result);
    })
    .catch((err) => {
      console.log(err);
    });
};

const user_put = (req, res) => {
  User.updateOne({ _id: req.params.id }, req.body)
    .then(async (result) => {
      await AuditLog.create({
        actorUsername: req.currentAdmin.username,
        actorRole: req.currentAdmin.role,
        action: "update",
        targetType: "customer",
        targetId: req.params.id,
        details: `Updated customer ${req.body.fireName || ""} ${req.body.lastName || ""}`.trim(),
      });
      res.redirect("/");
    })
    .catch((err) => {
      console.log(err);
    });
};

const user_add_get = (req, res) => {
  res.render("user/add");
};

const user_post = (req, res) => {
  User.create(req.body)
    .then(async (createdUser) => {
      await AuditLog.create({
        actorUsername: req.currentAdmin.username,
        actorRole: req.currentAdmin.role,
        action: "create",
        targetType: "customer",
        targetId: String(createdUser._id),
        details: `Created customer ${createdUser.fireName || ""} ${createdUser.lastName || ""}`.trim(),
      });
      res.redirect("/");
    })
    .catch((err) => {
      console.log(err);
    });
};

module.exports = {
  user_index_get,
  user_edit_get,
  user_view_get,
  user_search_post,
  user_search_live_get,
  user_delete,
  user_put,
  user_add_get,
  user_post,
};
