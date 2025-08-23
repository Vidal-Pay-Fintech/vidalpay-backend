"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AdminInvite;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const emailLayout_1 = require("../components/emailLayout");
const config_1 = require("../../src/utils/config");
function AdminInvite({ fullName, password }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsx)(components_1.Preview, { children: "Welcome To Lottonownow" }), (0, jsx_runtime_1.jsx)(components_1.Tailwind, { children: (0, jsx_runtime_1.jsx)(components_1.Body, { children: (0, jsx_runtime_1.jsx)(emailLayout_1.default, { children: (0, jsx_runtime_1.jsxs)(components_1.Row, { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xl font-semibold", style: { fontSize: '25px' }, children: "Welcome to LottoNowNow" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { children: ["Hi ", fullName, ","] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "This is to notify you that you have been invited as an admin on Lottonownow. Kindly login with the password below to access the lottonownow admin dashboard." }), (0, jsx_runtime_1.jsx)("h1", { className: "text-center text-5xl font-bold", style: { color: '#D3790D', fontSize: '40px' }, children: password }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "You can change your password after logging in." }), (0, jsx_runtime_1.jsx)("a", { href: config_1.CONFIG_VARIABLES.ADMIN_DASHBOARD_URL, className: "text-center text-3xl font-bold border rounded-xl", style: { color: '#D3790D' }, children: "Access Dashboard" })] }) }) }) })] }));
}
//# sourceMappingURL=admin-invite.js.map