import mapboxgl from "mapbox-gl";
import QRCode from "qrcode";
import {
  attendanceExpiry, grantAttendanceRetry, readDocument, replaceAttendanceDocument, reviewAttendanceRecord, saveAttendanceDocument,
  watchAttendanceCurrent, watchAttendanceRecords, watchAttendanceSessions
} from "../lib/firebase.js";
import { attendanceQrPayload, formatAttendanceTime } from "../lib/attendance.js";
import { wireDialog } from "../components/dialog.js";
import { CLASSES } from "./course.js";

import "mapbox-gl/dist/mapbox-gl.css";
import "../styles/attendance.css";

const $ = id => document.getElementById(id);
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
let reasonDialogReady = false;
let reasonDialogResolve = null;

function bindReasonDialog() {
  if (reasonDialogReady) return;
  const dialog = $("attendanceReasonDialog");
  const form = $("attendanceReasonForm");
  const input = $("attendanceReasonInput");
  const error = $("attendanceReasonError");
  wireDialog(dialog);
  dialog.addEventListener("close", () => {
    const resolve = reasonDialogResolve;
    reasonDialogResolve = null;
    resolve?.(null);
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const reason = input.value.trim();
    if (reason.length < 5) {
      error.textContent = "Vui lòng nhập ít nhất 5 ký tự.";
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    const resolve = reasonDialogResolve;
    reasonDialogResolve = null;
    dialog.close();
    resolve?.(reason);
  });
  input.addEventListener("input", () => {
    error.textContent = "";
    input.removeAttribute("aria-invalid");
  });
  reasonDialogReady = true;
}

function requestAttendanceReason({ title, description, confirmLabel }) {
  bindReasonDialog();
  const dialog = $("attendanceReasonDialog");
  if (dialog.open) return Promise.resolve(null);
  $("attendanceReasonTitle").textContent = title;
  $("attendanceReasonDescription").textContent = description;
  $("attendanceReasonSubmit").textContent = confirmLabel;
  $("attendanceReasonInput").value = "";
  $("attendanceReasonInput").removeAttribute("aria-invalid");
  $("attendanceReasonError").textContent = "";
  return new Promise(resolve => {
    reasonDialogResolve = resolve;
    dialog.showModal();
    requestAnimationFrame(() => $("attendanceReasonInput").focus());
  });
}

function dateLabel(iso) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function circleFeature(center, radius) {
  const coords = [];
  const earth = 6371008.8;
  const lat = center.latitude * Math.PI / 180;
  const lng = center.longitude * Math.PI / 180;
  const angular = radius / earth;
  for (let i = 0; i <= 64; i++) {
    const bearing = 2 * Math.PI * i / 64;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing));
    const nextLng = lng + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat), Math.cos(angular) - Math.sin(lat) * Math.sin(nextLat));
    coords.push([nextLng * 180 / Math.PI, nextLat * 180 / Math.PI]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}

export function startAttendanceAdmin(user) {
  const classSelect = $("attendanceClass"), sessionSelect = $("attendanceSession");
  const err = $("attendanceErr"), mapErr = $("mapErr");
  let current = null, sessions = [], records = [], config = null, center = null;
  let qrDataUrl = "", qrRenderVersion = 0;
  let map = null, marker = null, deviceMarker = null, stopCurrent = null, stopSessions = null, stopRecords = null;
  let timer = null, rotating = false, watchedSessionId = "";

  for (const [id, cls] of Object.entries(CLASSES)) classSelect.add(new Option(cls.name, id));
  fillSessions();

  function fillSessions() {
    const cls = CLASSES[classSelect.value];
    sessionSelect.replaceChildren(...(cls?.sessions || []).map((session, i) => new Option(
      `${dateLabel(session.date)} · Buổi ${i + 1} · ${session.from}–${session.to} · ${session.topic}`,
      `${classSelect.value}:${i}`
    )));
    renderHistory();
  }

  function fillSessionOptions() {
    const old = sessionSelect.value;
    fillSessions();
    if ([...sessionSelect.options].some(option => option.value === old)) sessionSelect.value = old;
  }

  function currentSelection() {
    const [classId, index] = sessionSelect.value.split(":");
    return { classId, sessionIndex: Number(index), session: CLASSES[classId]?.sessions?.[Number(index)] };
  }

  async function initializeMap() {
    config = await readDocument("attendance/config").catch(e => { mapErr.textContent = `Không tải được cấu hình GPS: ${e.code || e.message}`; return null; });
    if (config?.center && Number.isFinite(config.center.latitude) && Number.isFinite(config.center.longitude)) center = config.center;
    $("geofenceRadius").value = config?.radiusMeters ?? "100";
    $("geofenceAccuracy").value = config?.accuracyThresholdMeters ?? "100";

    if (!MAPBOX_TOKEN) {
      mapErr.textContent = "Thiếu VITE_MAPBOX_ACCESS_TOKEN. Thêm public token vào .env.local rồi khởi động lại dev server để dùng bản đồ.";
      return;
    }
    mapboxgl.accessToken = MAPBOX_TOKEN;
    map = new mapboxgl.Map({
      container: "geofenceMap",
      style: "mapbox://styles/mapbox/streets-v12",
      center: center ? [center.longitude, center.latitude] : [106, 16],
      zoom: center ? 15 : 5,
      attributionControl: true
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("load", () => {
      map.addSource("geofence", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "geofence-fill", type: "fill", source: "geofence", paint: { "fill-color": "#f97316", "fill-opacity": 0.13 } });
      map.addLayer({ id: "geofence-line", type: "line", source: "geofence", paint: { "line-color": "#f97316", "line-width": 2 } });
      if (center) setCenter(center, false);
      map.resize();
      focusDeviceLocation();
    });
    map.on("click", event => setCenter({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }));
  }

  function focusDeviceLocation() {
    if (!navigator.geolocation) {
      mapErr.textContent = "Thiết bị không hỗ trợ GPS; bản đồ giữ nguyên vị trí hiện tại.";
      return;
    }
    navigator.geolocation.getCurrentPosition(position => {
      const location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const hasSavedCenter = !!center;
      if (!hasSavedCenter) setCenter(location, false);
      if (hasSavedCenter && !deviceMarker) {
        deviceMarker = new mapboxgl.Marker({ color: "#2563eb" })
          .setLngLat([location.longitude, location.latitude])
          .setPopup(new mapboxgl.Popup({ offset: 24 }).setText("Vị trí GPS của thiết bị cấu hình"))
          .addTo(map);
      } else if (deviceMarker) deviceMarker.setLngLat([location.longitude, location.latitude]);
      map.flyTo({ center: [location.longitude, location.latitude], zoom: 17 });
    }, error => {
      const message = error.code === error.PERMISSION_DENIED
        ? "Trình duyệt chưa được cấp quyền vị trí. Cho phép Location để bản đồ tự focus GPS của thiết bị."
        : "Không lấy được GPS thiết bị; kiểm tra quyền vị trí và HTTPS rồi thử lại.";
      mapErr.textContent = message;
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  }

  function setCenter(next, fly = true) {
    center = next;
    if (!map || !map.isStyleLoaded()) return;
    if (!marker) {
      marker = new mapboxgl.Marker({ color: "#f97316", draggable: true }).setLngLat([center.longitude, center.latitude]).addTo(map);
      marker.on("dragend", () => {
        const point = marker.getLngLat();
        setCenter({ latitude: point.lat, longitude: point.lng }, false);
      });
    } else marker.setLngLat([center.longitude, center.latitude]);
    const radius = Math.max(1, Number($("geofenceRadius").value) || 100);
    map.getSource("geofence")?.setData(circleFeature(center, radius));
    if (fly) map.flyTo({ center: [center.longitude, center.latitude], zoom: Math.max(map.getZoom(), 15) });
  }

  function updateCircle() {
    if (center && map?.isStyleLoaded()) map.getSource("geofence")?.setData(circleFeature(center, Math.max(1, Number($("geofenceRadius").value) || 100)));
  }

  function renderCurrent() {
    const live = current?.active === true;
    $("attendanceLive").hidden = !live;
    $("attendanceStart").disabled = live || !sessionSelect.value;
    $("attendanceEnd").disabled = !live;
    if (!live) {
      if (timer) clearInterval(timer);
      timer = null;
      qrRenderVersion++;
      qrDataUrl = "";
      $("attendanceQrOpen").disabled = true;
      $("attendanceQr").removeAttribute("src");
      if ($("attendanceQrDialog").open) $("attendanceQrDialog").close();
      return;
    }
    const cls = CLASSES[current.classId];
    const session = cls?.sessions?.[current.sessionIndex];
    $("attendanceLiveTitle").textContent = `${cls?.short || current.classId} · ${session?.topic || "Buổi học"}`;
    $("attendanceLiveInfo").textContent = `${session ? dateLabel(session.date) + " · " + session.from + "–" + session.to + " · " + session.room : ""} · QR đang hoạt động`;
    if (current.currentToken) renderQr(current.sessionId, current.currentToken);
    if (!timer) timer = setInterval(tick, 1000);
    tick();
  }

  async function renderQr(sessionId, token) {
    const version = ++qrRenderVersion;
    qrDataUrl = "";
    $("attendanceQrOpen").disabled = true;
    $("attendanceQr").removeAttribute("src");
    $("attendanceQrFullscreen").removeAttribute("src");
    try {
      const dataUrl = await QRCode.toDataURL(attendanceQrPayload(sessionId, token), { width: 640, margin: 3, errorCorrectionLevel: "H" });
      if (version !== qrRenderVersion || current?.sessionId !== sessionId || current?.currentToken !== token) return;
      qrDataUrl = dataUrl;
      $("attendanceQr").src = dataUrl;
      if ($("attendanceQrDialog").open) $("attendanceQrFullscreen").src = dataUrl;
      $("attendanceQrOpen").disabled = false;
    } catch (e) { err.textContent = `Không tạo được QR: ${e.message}`; }
  }

  function openFullscreenQr() {
    if (!current?.active || !qrDataUrl) return;
    const cls = CLASSES[current.classId];
    const session = cls?.sessions?.[current.sessionIndex];
    $("attendanceQrClass").textContent = cls?.name || current.classId;
    $("attendanceQrDialogTitle").textContent = session?.topic || "Buổi học";
    $("attendanceQrInfo").textContent = session ? `${dateLabel(session.date)} · ${session.from}–${session.to} · ${session.room}` : "";
    $("attendanceQrFullscreen").src = qrDataUrl;
    $("attendanceQrCountdown").textContent = $("attendanceCountdown").textContent;
    $("attendanceQrDialog").showModal();
  }

  function tick() {
    if (!current?.active) return;
    const expiry = current.tokenExpiresAt?.toMillis?.() || 0;
    const remaining = expiry - Date.now();
    $("attendanceCountdown").textContent = remaining > 0
      ? `Mã hiện tại hết hạn sau ${Math.ceil(remaining / 1000)} giây`
      : "Đang làm mới mã điểm danh…";
    $("attendanceQrCountdown").textContent = $("attendanceCountdown").textContent;
    if (remaining <= 1500 && !rotating) rotateToken();
  }

  async function rotateToken() {
    if (!current?.active || rotating) return;
    rotating = true;
    const token = crypto.randomUUID().replaceAll("-", "");
    try {
      await saveAttendanceDocument("attendance/current", {
        currentToken: token,
        tokenExpiresAt: attendanceExpiry(Date.now() + 60_000)
      });
    } catch (e) {
      err.textContent = `Không đổi được mã QR: ${e.code || e.message}`;
    } finally { rotating = false; }
  }

  async function startSession() {
    err.textContent = "";
    if (current?.active) return;
    const { classId, sessionIndex, session } = currentSelection();
    if (!session) { err.textContent = "Chọn lớp và buổi học hợp lệ."; return; }
    if (!config?.center || !Number.isFinite(config.radiusMeters) || !Number.isFinite(config.accuracyThresholdMeters)) {
      err.textContent = "Hãy đặt tâm bản đồ và lưu cấu hình GPS trước khi mở phiên.";
      return;
    }
    const sessionId = crypto.randomUUID();
    const initialToken = crypto.randomUUID().replaceAll("-", "");
    const doc = {
      sessionId, classId, sessionIndex, date: session.date, from: session.from, to: session.to,
      room: session.room, topic: session.topic, active: true,
      startedBy: String(user?.email || "").toLowerCase(), startedAt: new Date(),
      currentToken: initialToken, tokenExpiresAt: attendanceExpiry(Date.now() + 60_000)
    };
    $("attendanceStart").disabled = true;
    try {
      const { currentToken, tokenExpiresAt, ...sessionHistory } = doc;
      await saveAttendanceDocument(`attendanceSessions/${sessionId}`, sessionHistory);
      await replaceAttendanceDocument("attendance/current", doc);
      err.textContent = "";
    } catch (e) {
      err.textContent = `Không mở được phiên: ${e.code || e.message}`;
      $("attendanceStart").disabled = false;
    }
  }

  async function endSession() {
    if (!current?.active) return;
    $("attendanceEnd").disabled = true;
    const endedAt = new Date();
    try {
      await Promise.all([
        saveAttendanceDocument("attendance/current", { active: false, currentToken: "", endedAt, endedBy: String(user?.email || "").toLowerCase() }),
        saveAttendanceDocument(`attendanceSessions/${current.sessionId}`, { active: false, endedAt, endedBy: String(user?.email || "").toLowerCase() })
      ]);
    } catch (e) {
      err.textContent = `Không kết thúc được phiên: ${e.code || e.message}`;
      $("attendanceEnd").disabled = false;
    }
  }

  async function saveGeofence() {
    mapErr.textContent = "";
    const radiusMeters = Number($("geofenceRadius").value);
    const accuracyThresholdMeters = Number($("geofenceAccuracy").value);
    if (!center) { mapErr.textContent = "Bấm lên bản đồ để chọn tâm khuôn viên trước."; return; }
    if (!Number.isInteger(radiusMeters) || radiusMeters < 1 || radiusMeters > 50000) { mapErr.textContent = "Bán kính phải là số nguyên từ 1 đến 50.000 mét."; return; }
    if (!Number.isInteger(accuracyThresholdMeters) || accuracyThresholdMeters < 1 || accuracyThresholdMeters > 1000) { mapErr.textContent = "Sai số GPS tối đa phải là số nguyên từ 1 đến 1.000 mét."; return; }
    $("geofenceSave").disabled = true;
    try {
      config = { center, radiusMeters, accuracyThresholdMeters, configuredBy: String(user?.email || "").toLowerCase() };
      await saveAttendanceDocument("attendance/config", config);
      mapErr.textContent = "Đã lưu cấu hình geofence.";
      updateCircle();
    } catch (e) { mapErr.textContent = `Không lưu được: ${e.code || e.message}`; }
    finally { $("geofenceSave").disabled = false; }
  }

  function renderHistory() {
    const { classId, sessionIndex } = currentSelection();
    const sessionKey = `${classId}:${sessionIndex}`;
    const matching = sessions.filter(item => item.classId === classId && item.sessionIndex === sessionIndex);
    const latest = matching[0];
    $("attendanceRecordsMeta").textContent = latest ? `Phiên mở gần nhất: ${formatAttendanceTime(latest.startedAt)} · ${matching.length} lần mở` : "Buổi này chưa có phiên điểm danh.";
    const target = current?.active && current.classId === classId && current.sessionIndex === sessionIndex ? current : latest;
    const id = target?.sessionId || "";
    if (id !== watchedSessionId) {
      if (stopRecords) stopRecords();
      watchedSessionId = id;
      records = [];
      if (id) stopRecords = watchAttendanceRecords(id, rows => { records = rows; renderRecords(); }, e => { $("attendanceErr").textContent = `Không tải được bản ghi: ${e.code || e.message}`; });
    }
    renderRecords();
    if (sessionSelect.dataset.key !== sessionKey) sessionSelect.dataset.key = sessionKey;
  }

  function renderRecords() {
    const tbody = $("attendanceRows");
    tbody.replaceChildren(...records.map(record => {
      const tr = document.createElement("tr");
      const outcome = record.status === "present" ? "Có mặt" : record.status === "excused" ? "Ngoại lệ đã duyệt" : "Bị từ chối";
      [record.studentName || "—", record.studentEmail || "—"].forEach(value => tr.append(el("td", null, value)));
      const result = el("td");
      result.append(el("span", null, `${outcome} · ${record.gpsResult || "—"}${record.retryAllowed ? " · Đã cho phép thử lại" : ""}`));
      if (record.reviewReason) result.append(el("small", "attendance-review-note", record.reviewReason));
      if (record.retryHistory?.length) {
        const details = document.createElement("details");
        details.className = "attendance-retry-history";
        details.append(el("summary", null, `Lịch sử ${record.retryHistory.length} lần trước`));
        const list = document.createElement("ul");
        record.retryHistory.forEach(attempt => list.append(el("li", null, `Lần ${attempt.attempt}: ${attempt.status === "present" ? "Có mặt" : "Bị từ chối"} · ${attempt.gpsResult || "—"} · sai số ${attempt.accuracyMeters == null ? "không có" : Math.round(attempt.accuracyMeters) + " m"} · ${formatAttendanceTime(attempt.submittedAt)}${attempt.retryReason ? " · " + attempt.retryReason : ""}`)));
        details.append(list);
        result.append(details);
      }
      tr.append(result);
      [record.accuracyMeters == null ? "Không có" : `${Math.round(record.accuracyMeters)} m`, formatAttendanceTime(record.submittedAt)].forEach(value => tr.append(el("td", null, value)));
      const action = el("td");
      const button = el("button", "btn btn-ghost btn-sm", record.status === "present" ? "Sửa trạng thái" : "Duyệt ngoại lệ");
      button.type = "button";
      button.addEventListener("click", () => reviewRecord(record));
      action.append(button);
      if (record.status === "rejected") {
        const retry = el("button", "btn btn-ghost btn-sm", record.retryAllowed ? "Đã cho phép · chờ quét" : "Cho điểm danh lại");
        retry.type = "button";
        retry.disabled = !!record.retryAllowed;
        retry.addEventListener("click", () => grantRetry(record));
        action.append(retry);
      }
      tr.append(action);
      return tr;
    }));
    if (!records.length) {
      const tr = document.createElement("tr"), td = el("td", "muted", "Chưa có bản ghi cho phiên này.");
      td.colSpan = 6; tr.append(td); tbody.append(tr);
    }
  }

  async function reviewRecord(record) {
    const status = ["present", "excused"].includes(record.status) ? "rejected" : "present";
    const action = status === "present" ? "duyệt ngoại lệ thành có mặt" : "đổi trạng thái thành bị từ chối";
    const reason = await requestAttendanceReason({
      title: status === "present" ? "Duyệt ngoại lệ" : "Sửa trạng thái điểm danh",
      description: `Nhập lý do ${action}. Lý do sẽ được lưu cùng bản ghi.`,
      confirmLabel: status === "present" ? "Duyệt ngoại lệ" : "Lưu thay đổi"
    });
    if (reason == null) return;
    try {
      await reviewAttendanceRecord(record.id, {
        status: status === "present" ? "excused" : "rejected",
        reviewReason: reason,
        reviewedBy: String(user?.email || "").toLowerCase(),
        retryAllowed: false
      });
      err.textContent = "Đã lưu điều chỉnh kèm lý do.";
    } catch (e) { err.textContent = `Không sửa được bản ghi: ${e.code || e.message}`; }
  }

  async function grantRetry(record) {
    if (record.status !== "rejected" || record.retryAllowed) return;
    const reason = await requestAttendanceReason({
      title: "Cho phép điểm danh lại",
      description: `Cấp một lượt quét QR mới cho ${record.studentName || record.studentEmail}. Nhập lý do để lưu vào lịch sử.`,
      confirmLabel: "Cho điểm danh lại"
    });
    if (reason == null) return;
    const attemptCount = Math.max(1, Number(record.attemptCount) || 1);
    const retryHistory = [...(record.retryHistory || []), {
      attempt: attemptCount,
      status: record.status,
      gpsResult: record.gpsResult || "unavailable",
      accuracyMeters: record.accuracyMeters ?? null,
      submittedAt: record.submittedAt || null,
      retryReason: reason
    }];
    try {
      await grantAttendanceRetry(record.id, {
        retryAllowed: true,
        retryReason: reason,
        retryAllowedBy: String(user?.email || "").toLowerCase(),
        attemptCount,
        retryHistory
      });
      err.textContent = "Đã cho phép điểm danh lại; sinh viên hãy quét QR mới trong thời gian còn hiệu lực.";
    } catch (e) { err.textContent = `Không cấp được lượt điểm danh lại: ${e.code || e.message}`; }
  }

  classSelect.addEventListener("change", fillSessionOptions);
  sessionSelect.addEventListener("change", renderHistory);
  $("attendanceStart").addEventListener("click", startSession);
  $("attendanceEnd").addEventListener("click", endSession);
  $("attendanceQrOpen").addEventListener("click", openFullscreenQr);
  $("attendanceQrClose").addEventListener("click", () => $("attendanceQrDialog").close());
  $("attendanceQrDialog").addEventListener("click", event => { if (event.target === $("attendanceQrDialog")) $("attendanceQrDialog").close(); });
  $("geofenceRadius").addEventListener("input", updateCircle);
  $("geofenceSave").addEventListener("click", saveGeofence);
  $("geofenceLocate").addEventListener("click", () => {
    if (!navigator.geolocation) { mapErr.textContent = "Thiết bị admin không hỗ trợ định vị."; return; }
    navigator.geolocation.getCurrentPosition(pos => setCenter({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }), e => { mapErr.textContent = `Không lấy được vị trí thiết bị: ${e.message}`; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
  stopCurrent = watchAttendanceCurrent(doc => { current = doc; renderCurrent(); renderHistory(); }, e => { err.textContent = `Không tải được phiên hiện tại: ${e.code || e.message}`; });
  stopSessions = watchAttendanceSessions(rows => { sessions = rows; renderHistory(); }, e => { err.textContent = `Không tải được lịch sử phiên: ${e.code || e.message}`; });
  initializeMap();

  return () => {
    if (timer) clearInterval(timer);
    stopCurrent?.(); stopSessions?.(); stopRecords?.();
    map?.remove();
  };
}
