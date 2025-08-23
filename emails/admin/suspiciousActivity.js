"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SuspiciousActivityNotification;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const emailLayout_1 = require("../components/emailLayout");
function SuspiciousActivityNotification({ userName }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsxs)(components_1.Preview, { children: ["Suspicious Activity Detected on ", userName, "'s Account"] }), (0, jsx_runtime_1.jsx)(components_1.Tailwind, { children: (0, jsx_runtime_1.jsx)(components_1.Body, { children: (0, jsx_runtime_1.jsx)(emailLayout_1.default, { children: (0, jsx_runtime_1.jsxs)(components_1.Row, { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xl font-semibold", style: { fontSize: '25px' }, children: "Alert: Suspicious Activity Detected" }), (0, jsx_runtime_1.jsx)(components_1.Text, { children: "Hello Team," }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "text-justify", children: ["We have detected suspicious activity on the account associated with ", (0, jsx_runtime_1.jsx)("strong", { children: userName }), "."] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "Please review the account for compliance and take any necessary actions to ensure platform security. This review will help us maintain the integrity of our platform and protect our user base." })] }) }) }) })] }));
}
//# sourceMappingURL=suspiciousActivity.js.map