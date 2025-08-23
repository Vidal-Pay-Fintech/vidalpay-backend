"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = WithdrawalSuccessNotification;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const emailLayout_1 = require("../components/emailLayout");
const helperFuncs_1 = require("../../src/utils/helperFuncs");
function WithdrawalSuccessNotification({ userName, amount }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsx)(components_1.Preview, { children: "Withdrawal Completed Successfully" }), (0, jsx_runtime_1.jsx)(components_1.Tailwind, { children: (0, jsx_runtime_1.jsx)(components_1.Body, { children: (0, jsx_runtime_1.jsx)(emailLayout_1.default, { children: (0, jsx_runtime_1.jsxs)(components_1.Row, { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xl font-semibold", style: { fontSize: '25px' }, children: "Withdrawal Successful" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { children: ["Hello ", userName, ","] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "text-justify", children: ["We are pleased to inform you that your recent withdrawal request of NGN", helperFuncs_1.UTILITIES.formatMoney(amount), "has been completed successfully."] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "The funds should now be available in your designated account. If you have any questions or need further assistance, please feel free to contact our support team." }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "Thanks for playing with Lottonownow" })] }) }) }) })] }));
}
//# sourceMappingURL=WithdrawalSuccessful.js.map