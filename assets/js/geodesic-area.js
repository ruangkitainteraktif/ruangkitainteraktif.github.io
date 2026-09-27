(function () {
  'use strict';

  var R_LEAFLET = 6378137;
  var R_TURF = 6371008.8;
  var R_GEOID = 6371000;
  var FAST_LIMIT = 12000;
  var WGS84_A = 6378137;
  var WGS84_F = 1 / 298.257223563;
  var WGS84_E2 = WGS84_F * (2 - WGS84_F);
  var WGS84_E = Math.sqrt(WGS84_E2);
  var AUTHALIC_QP = 1 - ((1 - WGS84_E2) / (2 * WGS84_E)) * Math.log((1 - WGS84_E) / (1 + WGS84_E));
  var AUTHALIC_R2 = WGS84_A * WGS84_A * AUTHALIC_QP / 2;
  var warned = {};

  function geod() {
    try {
      if (typeof geodesic !== 'undefined' && geodesic && geodesic.Geodesic && geodesic.Geodesic.WGS84) {
        return geodesic.Geodesic.WGS84;
      }
    } catch (_) { }
    return null;
  }

  function warnOnce(key) {
    if (warned[key]) return;
    warned[key] = true;
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[geoArea] GeographicLib tidak tersedia, memakai rumus lama (' + key + ').');
    }
  }

  function isLatLng(v) {
    return !!v && typeof v === 'object' && Number.isFinite(+v.lat) && Number.isFinite(+v.lng);
  }

  function isPair(v) {
    return Array.isArray(v) && v.length >= 2 && Number.isFinite(+v[0]) && Number.isFinite(+v[1]);
  }

  function toLat(v) { return isLatLng(v) ? +v.lat : +v[0]; }
  function toLng(v) { return isLatLng(v) ? +v.lng : +v[1]; }

  function collectRings(value) {
    if (!value) return [];
    if (isLatLng(value)) return [[value]];
    if (!Array.isArray(value)) return [];
    if (value.length && isLatLng(value[0])) return [value];
    if (value.length && isPair(value[0])) return [value];
    var rings = [];
    for (var i = 0; i < value.length; i++) rings = rings.concat(collectRings(value[i]));
    return rings;
  }

  function countRingsPoints(rings) {
    var total = 0;
    for (var i = 0; i < rings.length; i++) total += rings[i].length;
    return total;
  }

  function authalicSin(latDeg) {
    var sinLat = Math.sin(latDeg * Math.PI / 180);
    return (1 - WGS84_E2) * (sinLat / (1 - WGS84_E2 * sinLat * sinLat) -
      Math.log((1 - WGS84_E * sinLat) / (1 + WGS84_E * sinLat)) / (2 * WGS84_E)) / AUTHALIC_QP;
  }

  function ringAreaSignedGeodesic(g, ring) {
    var poly = g.Polygon();
    for (var i = 0; i < ring.length; i++) poly.AddPoint(toLat(ring[i]), toLng(ring[i]));
    return poly.Compute(false, true).area;
  }

  function ringAreaSignedAuthalic(ring) {
    var n = ring.length;
    if (n < 3) return 0;
    var total = 0;
    var d2r = Math.PI / 180;
    for (var i = 0; i < n; i++) {
      var p1 = ring[i];
      var p2 = ring[(i + 1) % n];
      total += (toLng(p2) - toLng(p1)) * d2r * (authalicSin(toLat(p1)) + authalicSin(toLat(p2)));
    }
    return -total * AUTHALIC_R2 / 2;
  }

  function ringAreaSignedSpherical(ring, R) {
    var n = ring.length;
    var total = 0;
    var d2r = Math.PI / 180;
    if (n > 2) {
      for (var i = 0; i < n; i++) {
        var p1 = ring[i];
        var p2 = ring[(i + 1) % n];
        total += (toLng(p2) - toLng(p1)) * d2r * (2 + Math.sin(toLat(p1) * d2r) + Math.sin(toLat(p2) * d2r));
      }
      total = R * total * R / 2;
    }
    return total;
  }

  function resolveAreaFn(rings, fallbackR) {
    var g = geod();
    if (!g) {
      warnOnce('luas');
      return function (ring) { return ringAreaSignedSpherical(ring, fallbackR); };
    }
    if (countRingsPoints(rings) <= FAST_LIMIT) {
      return function (ring) {
        var area = ringAreaSignedGeodesic(g, ring);
        if (Number.isFinite(area)) return area;
        var fast = ringAreaSignedAuthalic(ring);
        return Number.isFinite(fast) ? fast : ringAreaSignedSpherical(ring, fallbackR);
      };
    }
    return function (ring) {
      var fast = ringAreaSignedAuthalic(ring);
      if (Number.isFinite(fast)) return fast;
      return ringAreaSignedSpherical(ring, fallbackR);
    };
  }

  function combineRings(rings, areaFn, useOrientation) {
    if (useOrientation) {
      return Math.abs(rings.reduce(function (sum, ring) { return sum + areaFn(ring); }, 0));
    }
    return rings.reduce(function (sum, ring, index) {
      var abs = Math.abs(areaFn(ring));
      return sum + (index === 0 ? abs : -abs);
    }, 0);
  }

  function areaM2FromRings(input, useOrientation) {
    var rings = collectRings(input);
    if (!rings.length) return 0;
    var areaFn = resolveAreaFn(rings, useOrientation ? R_GEOID : R_LEAFLET);
    return combineRings(rings, areaFn, !!useOrientation);
  }

  function forEachPolygon(geom, cb) {
    if (!geom) return;
    if (geom.type === 'Feature') return forEachPolygon(geom.geometry, cb);
    if (geom.type === 'FeatureCollection') {
      (geom.features || []).forEach(function (f) { forEachPolygon(f, cb); });
      return;
    }
    if (geom.type === 'Polygon') cb(geom.coordinates || []);
    else if (geom.type === 'MultiPolygon') (geom.coordinates || []).forEach(cb);
  }

  function forEachLine(geom, cb) {
    if (!geom) return;
    if (geom.type === 'Feature') return forEachLine(geom.geometry, cb);
    if (geom.type === 'FeatureCollection') {
      (geom.features || []).forEach(function (f) { forEachLine(f, cb); });
      return;
    }
    if (geom.type === 'LineString') cb(geom.coordinates || []);
    else if (geom.type === 'MultiLineString') (geom.coordinates || []).forEach(cb);
    else if (geom.type === 'Polygon') (geom.coordinates || []).forEach(cb);
    else if (geom.type === 'MultiPolygon') {
      (geom.coordinates || []).forEach(function (poly) { poly.forEach(cb); });
    }
  }

  function areaM2FromGeoJSON(geojson) {
    if (!geojson) return 0;
    var polygons = [];
    forEachPolygon(geojson, function (rings) {
      var converted = [];
      for (var i = 0; i < rings.length; i++) {
        var ring = rings[i];
        var out = [];
        for (var j = 0; j < ring.length; j++) out.push([ring[j][1], ring[j][0]]);
        converted.push(out);
      }
      polygons.push(converted);
    });
    if (!polygons.length) return 0;
    var all = [];
    polygons.forEach(function (rings) {
      rings.forEach(function (ring) { all.push(ring); });
    });
    var areaFn = resolveAreaFn(all, R_TURF);
    return polygons.reduce(function (sum, rings) {
      return sum + combineRings(rings, areaFn, false);
    }, 0);
  }

  function flattenPoints(value, out) {
    out = out || [];
    if (!value) return out;
    if (isLatLng(value)) { out.push(value); return out; }
    if (isPair(value)) { out.push(value); return out; }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) flattenPoints(value[i], out);
    }
    return out;
  }

  function haversine(p1, p2, R) {
    var d2r = Math.PI / 180;
    var dLat = (toLat(p2) - toLat(p1)) * d2r;
    var dLng = (toLng(p2) - toLng(p1)) * d2r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toLat(p1) * d2r) * Math.cos(toLat(p2) * d2r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function lengthM(points) {
    var pts = flattenPoints(points);
    if (pts.length < 2) return 0;
    var g = geod();
    var total = 0;
    if (!g) warnOnce('panjang');
    for (var i = 1; i < pts.length; i++) {
      total += g
        ? g.Inverse(toLat(pts[i - 1]), toLng(pts[i - 1]), toLat(pts[i]), toLng(pts[i])).s12
        : haversine(pts[i - 1], pts[i], R_LEAFLET);
    }
    return total;
  }

  function lengthMFromGeoJSON(geojson) {
    if (!geojson) return 0;
    var lines = [];
    forEachLine(geojson, function (coords) { lines.push(coords); });
    if (!lines.length) return 0;
    var g = geod();
    if (!g) warnOnce('panjang');
    var total = 0;
    for (var i = 0; i < lines.length; i++) {
      var ring = lines[i];
      for (var j = 1; j < ring.length; j++) {
        var p1 = ring[j - 1];
        var p2 = ring[j];
        total += g
          ? g.Inverse(+p1[1], +p1[0], +p2[1], +p2[0]).s12
          : haversine([p1[1], p1[0]], [p2[1], p2[0]], R_TURF);
      }
    }
    return total;
  }

  window.geoArea = {
    available: function () { return !!geod(); },
    areaM2FromRings: areaM2FromRings,
    areaM2FromGeoJSON: areaM2FromGeoJSON,
    areaHaFromRings: function (input) { return areaM2FromRings(input) / 10000; },
    areaHaFromGeoJSON: function (geojson) { return areaM2FromGeoJSON(geojson) / 10000; },
    lengthM: lengthM,
    lengthMFromGeoJSON: lengthMFromGeoJSON
  };
})();
