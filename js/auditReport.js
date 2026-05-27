/**
 * Strategy Validation Lab — Audit Report & Export Manager
 * 
 * Compiles performance records and transaction logs into professional,
 * exportable CSV ledgers and structured JSON data.
 */
(function () {
  'use strict';

  function downloadCSV(closedTrades, timeline) {
    if (closedTrades.length === 0) return;

    var csvContent = "data:text/csv;charset=utf-8,";
    // Header
    csvContent += "Time,Ticker,Action,Qty,Price,Stop Loss,Target,Outcome P&L,Status\n";

    closedTrades.forEach(function (t) {
      csvContent += `${t.entryTime},${t.ticker},${t.type},${t.shares},${t.entryPrice},${t.stopLoss},${t.takeProfit},₹${t.pnl.toFixed(0)},${t.outcome}\n`;
    });

    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Strategy_Validation_Audit_Ledger.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function downloadJSON(perf, closedTrades, portfolio) {
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
      auditDate: new Date().toLocaleDateString(),
      metrics: perf,
      closedTrades: closedTrades,
      frictionalCharges: {
        brokerage: portfolio.brokerageFees,
        taxes: portfolio.taxFees,
        slippage: portfolio.slippageFees
      }
    }, null, 2));

    var link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", "Strategy_Validation_Full_Report.json");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function printReport() {
    window.print();
  }

  window.AuditReport = {
    downloadCSV: downloadCSV,
    downloadJSON: downloadJSON,
    printReport: printReport
  };
})();
