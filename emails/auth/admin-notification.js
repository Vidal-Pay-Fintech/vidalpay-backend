"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AdminEmailNotification;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const emailLayout_1 = require("../components/emailLayout");
function AdminEmailNotification({ fullName, message }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsx)(components_1.Preview, { children: "Possible Double Draw Error" }), (0, jsx_runtime_1.jsx)(components_1.Tailwind, { children: (0, jsx_runtime_1.jsx)(components_1.Body, { children: (0, jsx_runtime_1.jsx)(emailLayout_1.default, { children: (0, jsx_runtime_1.jsxs)(components_1.Row, { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xl font-semibold", style: { fontSize: '25px' }, children: "Action Required - Please Check" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { children: ["Hi ", fullName, ","] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: message })] }) }) }) })] }));
}
//# sourceMappingURL=admin-notification.js.map