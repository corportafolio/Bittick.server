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

  var containerWidth = container.clientWidth || container.offsetWidth || 340;
  if (containerWidth === 0) {
    console.warn('Chart container has 0 width, deferring render');
    return;
  }

  try {
    chart = LightweightCharts.createChart(container, {
      width: containerWidth,
      height: container.clientHeight || 340,
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
        secondsVisible: false
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
    console.error('Chart render error:', e);
    if (containerEl) {
      containerEl.innerHTML = '<div class="chart-placeholder" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;color:var(--text-muted);font-size:.85rem;gap:8px">Error cargando gráfico</div>';
    }
  }
}

function setData(data){
  if(!chart || !data || !data.length) return;

  var candles = [];
  var volumes = [];

  for(var i = 0; i < data.length; i++){
    var d = data[i];
    var t = d.openTime || d.time || 0;
    var ts = Math.floor(t / 1000);

    var o = parseFloat(d.open);
    var h = parseFloat(d.high);
    var l = parseFloat(d.low);
    var c = parseFloat(d.close);
    var v = parseFloat(d.volume);

    if(isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) continue;

    candles.push({ time: ts, open: o, high: h, low: l, close: c });

    if (isNaN(v)) v = 0;
    var volColor = c >= o ? 'rgba(76,175,80,0.3)' : 'rgba(244,67,54,0.3)';
    volumes.push({ time: ts, value: v, color: volColor });
  }

  candleSeries.setData(candles);
  volumeSeries.setData(volumes);

  chart.timeScale().fitContent();
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
