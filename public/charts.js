/* ============================================
   BITTICK WEB - CHARTS.JS
   Candlestick + Volume chart using Lightweight Charts
   ============================================ */
var BittickChart = (function(){
'use strict';

var chart = null;
var candleSeries = null;
var volumeSeries = null;
var container = null;
var tradingZoneMarkers = [];

function render(containerEl, data, options){
  container = containerEl;
  if(!container || !window.LightweightCharts) return;

  if(chart){
    chart.remove();
    chart = null;
    candleSeries = null;
    volumeSeries = null;
  }

  var opts = options || {};
  var upColor = opts.upColor || '#4CAF50';
  var downColor = opts.downColor || '#F44336';

  // Wait for container to have valid dimensions
  var waitForContainer = function() {
    var w = container.clientWidth || container.offsetWidth || 0;
    var h = container.clientHeight || container.offsetHeight || 0;
    if (w === 0 || h === 0) {
      console.warn('Chart container not ready (size:', w, 'x', h, '), waiting...');
      requestAnimationFrame(waitForContainer);
      return;
    }
    doRender(w, h);
  };

  var doRender = function(containerWidth, containerHeight) {
    // Validate data before creating chart
    if (!data || !data.length) {
      console.warn('No chart data provided');
      return;
    }

    console.log('Rendering chart with', data.length, 'candles, container:', containerWidth, 'x', containerHeight);

    try {
      chart = LightweightCharts.createChart(container, {
        width: containerWidth,
        height: containerHeight,
        layout: {
          background: { color: '#1A1A1A' },
          textColor: '#999999',
          fontSize: 11
        },
        grid: {
          vertLines: { color: '#252525' },
          horzLines: { color: '#252525' }
        },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal,
          vertLine: { color: '#F7931A', width: 1, style: 0, labelBackgroundColor: '#F7931A' },
          horzLine: { color: '#F7931A', width: 1, style: 0, labelBackgroundColor: '#F7931A' }
        },
        rightPriceScale: {
          borderColor: '#2A2A2A',
          scaleMargins: { top: 0.1, bottom: 0.25 }
        },
        timeScale: {
          borderColor: '#2A2A2A',
          timeVisible: true,
          secondsVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true
        },
        handleScale: { axisPressedMouseMove: true },
        handleScroll: { mouseWheel: true, pressedMouseMove: true }
      });

      candleSeries = chart.addCandlestickSeries({
        upColor: upColor,
        downColor: downColor,
        borderUpColor: upColor,
        borderDownColor: downColor,
        wickUpColor: upColor,
        wickDownColor: downColor
      });

      volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        color: '#F7931A',
        scaleMargins: { top: 0.8, bottom: 0 }
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 }
      });

      setData(data);

      var ro = new ResizeObserver(function(entries){
        if(chart && entries[0]){
          chart.applyOptions({
            width: entries[0].contentRect.width,
            height: entries[0].contentRect.height
          });
        }
      });
      ro.observe(container);
    } catch (e) {
      console.error('Chart render error:', e, e.stack);
      if (containerEl) {
        containerEl.innerHTML = '<div class="chart-placeholder" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;color:var(--text-muted);font-size:.85rem;gap:8px">Error cargando gráfico: ' + e.message + '</div>';
      }
    }
  };

  waitForContainer();
}

function setData(data){
  if(!chart || !data || !data.length) return;

  var candles = [];
  var volumes = [];
  var invalidCount = 0;

  for(var i = 0; i < data.length; i++){
    var d = data[i];
    var t = d.openTime || d.time || 0;
    var ts = Math.floor(t / 1000);

    if (!ts || ts <= 0) {
      console.warn('Invalid timestamp at index', i, d);
      invalidCount++;
      continue;
    }

    var o = parseFloat(d.open);
    var h = parseFloat(d.high);
    var l = parseFloat(d.low);
    var c = parseFloat(d.close);
    var v = parseFloat(d.volume);

    if(isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c) || o <= 0 || h <= 0 || l <= 0 || c <= 0) {
      console.warn('Invalid OHLC at index', i, d);
      invalidCount++;
      continue;
    }

    candles.push({ time: ts, open: o, high: h, low: l, close: c });

    if (isNaN(v)) v = 0;
    var volColor = c >= o ? 'rgba(76,175,80,0.3)' : 'rgba(244,67,54,0.3)';
    volumes.push({ time: ts, value: v, color: volColor });
  }

  if (candles.length === 0) {
    console.error('No valid candles after validation, invalid:', invalidCount);
    return;
  }

  console.log('Setting chart data:', candles.length, 'valid candles, invalid:', invalidCount);

  try {
    candleSeries.setData(candles);
    volumeSeries.setData(volumes);
    // Skip fitContent for monthly data (sparse) - causes "Value is null"
    if (candles.length > 100 && candles[0] && candles[candles.length - 1]) {
      var timeRange = candles[candles.length - 1].time - candles[0].time;
      var avgInterval = timeRange / candles.length;
      // If average interval > 15 days, it's likely monthly/weekly data
      if (avgInterval > 15 * 24 * 3600) {
        console.log('Sparse data detected (interval:', avgInterval / 86400, 'days), skipping fitContent');
      } else {
        chart.timeScale().fitContent();
      }
    } else {
      chart.timeScale().fitContent();
    }
  } catch (e) {
    console.error('setData error:', e, e.stack);
  }
}

function destroy(){
  if(chart){
    chart.remove();
    chart = null;
    candleSeries = null;
    volumeSeries = null;
    tradingZoneMarkers = [];
  }
}

function updateLastCandle(kline){
  if(!chart || !candleSeries || !kline) return;

  var t = Math.floor((kline.openTime || kline.time || 0) / 1000);
  var o = parseFloat(kline.open);
  var h = parseFloat(kline.high);
  var l = parseFloat(kline.low);
  var c = parseFloat(kline.close);
  var v = parseFloat(kline.volume);

  if(isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) return;

  candleSeries.update({ time: t, open: o, high: h, low: l, close: c });

  if (isNaN(v)) v = 0;
  var volColor = c >= o ? 'rgba(76,175,80,0.3)' : 'rgba(244,67,54,0.3)';
  volumeSeries.update({ time: t, value: v, color: volColor });
}

function drawTradingZone(date, type, startPrice, endPrice, color, lastTime) {
  if (!chart) return;
  var dateParts = date.split('-');
  var startTime = Math.floor(new Date(
    parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])
  ).getTime() / 1000);
  var endTime = lastTime || (startTime + (30 * 24 * 60 * 60));
  var top = Math.max(startPrice, endPrice);
  var bottom = Math.min(startPrice, endPrice);
  var noScale = function() { return null; };

  var fillSeries = chart.addBaselineSeries({
    baseValue: { type: 'price', price: bottom },
    topLineColor: 'transparent',
    topFillColor1: color + '11',
    topFillColor2: color + '11',
    bottomFillColor1: 'transparent',
    bottomFillColor2: 'transparent',
    lineWidth: 0,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
    autoscaleInfoProvider: noScale,
  });
  fillSeries.setData([{ time: startTime, value: top }, { time: endTime, value: top }]);
  tradingZoneMarkers.push(fillSeries);

  var topLine = chart.addLineSeries({
    color: color, lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    lastValueVisible: false, crosshairMarkerVisible: false,
    autoscaleInfoProvider: noScale,
  });
  topLine.setData([{ time: startTime, value: top }, { time: endTime, value: top }]);
  tradingZoneMarkers.push(topLine);

  var bottomLine = chart.addLineSeries({
    color: color, lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    lastValueVisible: false, crosshairMarkerVisible: false,
    autoscaleInfoProvider: noScale,
  });
  bottomLine.setData([{ time: startTime, value: bottom }, { time: endTime, value: bottom }]);
  tradingZoneMarkers.push(bottomLine);
}

function setTradingZones(zones, lastTime) {
  clearTradingZones();
  if (!zones || !zones.length) return;
  var end = lastTime || 0;
  for (var i = 0; i < zones.length; i++) {
    var z = zones[i];
    drawTradingZone(z.date, z.type, z.start_price, z.end_price, z.color, end);
  }
}

function clearTradingZones() {
  for (var i = 0; i < tradingZoneMarkers.length; i++) {
    try { chart.removeSeries(tradingZoneMarkers[i]); } catch(e) {}
  }
  tradingZoneMarkers = [];
}

return { render: render, setData: setData, updateLastCandle: updateLastCandle,
         setTradingZones: setTradingZones, clearTradingZones: clearTradingZones,
         destroy: destroy };

})();

// Expose LightweightCharts globally for charts.js
if (typeof window !== 'undefined' && typeof LightweightCharts !== 'undefined') {
  window.LightweightCharts = LightweightCharts;
}
