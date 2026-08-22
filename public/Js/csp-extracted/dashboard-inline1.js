    (function () {
      if (!window.ApexCharts) return;
      const OriginalApexCharts = window.ApexCharts;
      function WrappedApexCharts(el, options) {
        const instance = new OriginalApexCharts(el, options);
        window.__dashboardChartInstance = instance;
        window.__dashboardInitialChartOptions = options;
        return instance;
      }
      WrappedApexCharts.prototype = OriginalApexCharts.prototype;
      Object.setPrototypeOf(WrappedApexCharts, OriginalApexCharts);
      window.ApexCharts = WrappedApexCharts;
    })();
  
