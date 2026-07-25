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

function render(containerEl, data, options){
  container = containerEl;
  if(!container || !window LightweightCharts) return;

  if(chart){
    chart.remove();
    chart = null;
    candleSeries = null;
    volumeSeries = null;
  }

  var opts = options || {};
  var upColor = opts.upColor || '#4CAF50';
  var downColor = opts.downColor || '#F44336';

  chart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
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
  }
}

return { render: render, setData: setData, destroy: destroy };

})();
