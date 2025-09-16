"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = PrivateGamePayoutNotification;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const emailLayout_1 = require("../components/emailLayout");
const helperFuncs_1 = require("../../src/utils/helperFuncs");
function PrivateGamePayoutNotification({ firstName, drawType, amount, }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsx)(components_1.Preview, { children: "Your Private Game on LottoNowNow Has Been Completed!" }), (0, jsx_runtime_1.jsx)(components_1.Tailwind, { children: (0, jsx_runtime_1.jsx)(components_1.Body, { children: (0, jsx_runtime_1.jsx)(emailLayout_1.default, { children: (0, jsx_runtime_1.jsxs)(components_1.Row, { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xl font-semibold", style: { fontSize: '25px' }, children: "Private Game Completed" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { children: ["Hi ", firstName, ","] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "text-justify", children: ["We're pleased to inform you that a game draw for", ' ', drawType?.name, "has been successfully completed on LottoNowNow!"] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "The profits from your game have been automatically credited to your LottoNowNow wallet balance." }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "text-center font-extrabold", style: { color: '#D3790D', fontSize: '30px' }, children: ["NGN ", helperFuncs_1.UTILITIES.formatMoney(amount)] })] }) }) }) })] }));
}
//# sourceMappingURL=profitPayout.js.map