if (localStorage.getItem("isSmall") === "yes") {
  sidebarId.classList.add("small-sidebar");
} else {
  sidebarId.classList.remove("small-sidebar");
}

const toggleSidebar = () => {
  if (localStorage.getItem("isSmall") === "yes") {
    localStorage.setItem("isSmall", "no");
    sidebarId.classList.remove("small-sidebar");
  } else {
    localStorage.setItem("isSmall", "yes");
    sidebarId.classList.add("small-sidebar");
  }
};

const escapeHtml = (value) => {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

const renderCustomerRows = (customers, isViewer) => {
  const tbody = document.getElementById("customersTableBody");
  if (!tbody) return;

  const rows = customers
    .map((item, index) => {
      const viewBtn = `
        <a data-bs-toggle="tooltip" data-bs-title="View details" data-bs-placement="top" class="btn btn-primary btn-sm" href="/view/${item._id}">
          <i class="bi bi-eye"></i>
        </a>
      `;

      if (isViewer) {
        return `
          <tr>
            <th scope="row">${index + 1}</th>
            <td>${escapeHtml(item.fireName)} ${escapeHtml(item.lastName)}</td>
            <td>${escapeHtml(item.gender)}</td>
            <td>${escapeHtml(item.country)}</td>
            <td>${escapeHtml(item.age)}</td>
            <td>${escapeHtml(item.updatedAtFromNow)}</td>
            <td>${viewBtn}</td>
          </tr>
        `;
      }

      return `
        <tr>
          <th scope="row">${index + 1}</th>
          <td>${escapeHtml(item.fireName)} ${escapeHtml(item.lastName)}</td>
          <td>${escapeHtml(item.gender)}</td>
          <td>${escapeHtml(item.country)}</td>
          <td>${escapeHtml(item.age)}</td>
          <td>${escapeHtml(item.updatedAtFromNow)}</td>
          <td>
            ${viewBtn}
            <a data-bs-toggle="tooltip" data-bs-title="Edit user" data-bs-placement="top" class="btn btn-primary btn-sm" href="./edit/${item._id}">
              <i class="bi bi-pencil"></i>
            </a>
            <form style="display: inline;" action="/edit/${item._id}?_method=DELETE" method="post">
              <button data-bs-toggle="tooltip" data-bs-title="Delete user" data-bs-placement="top" class="btn btn-danger btn-sm">
                <i class="bi bi-trash"></i>
              </button>
            </form>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.innerHTML = rows;
};

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("liveSearchInput");
  const searchForm = input?.closest("form");
  const tbody = document.getElementById("customersTableBody");
  const table = document.getElementById("customersTable");
  const emptyState = document.getElementById("emptyStateMessage");
  const sortField = document.getElementById("sortField");
  const sortOrder = document.getElementById("sortOrder");
  if (!input || !tbody || !table || !emptyState) return;

  const isViewer = tbody.dataset.isViewer === "1";
  let timerId;
  let requestToken = 0;

  if (searchForm) {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
    });
  }

  const applyResults = (customers) => {
    renderCustomerRows(customers, isViewer);
    const hasData = customers.length > 0;
    table.classList.toggle("d-none", !hasData);
    emptyState.classList.toggle("d-none", hasData);
  };

  const runLiveSearch = () => {
    clearTimeout(timerId);
    timerId = setTimeout(async () => {
      const q = input.value.trim();
      const token = ++requestToken;
      input.classList.add("is-searching");
      const sortBy = sortField?.value || "updatedAt";
      const order = sortOrder?.value || "desc";
      try {
        const response = await fetch(
          `/search/live?q=${encodeURIComponent(q)}&sortBy=${encodeURIComponent(
            sortBy
          )}&order=${encodeURIComponent(order)}`
        );
        const data = await response.json();
        if (token === requestToken) {
          applyResults(Array.isArray(data) ? data : []);
        }
      } catch {
        if (token === requestToken) {
          applyResults([]);
        }
      } finally {
        if (token === requestToken) {
          input.classList.remove("is-searching");
        }
      }
    }, 250);
  };

  input.addEventListener("input", runLiveSearch);
  sortField?.addEventListener("change", runLiveSearch);
  sortOrder?.addEventListener("change", runLiveSearch);
});