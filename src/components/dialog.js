/**
 * Hộp thoại xác nhận dùng <dialog> (khung .modal trong dialog.css), thay cho confirm() của trình duyệt.
 * Trả về Promise<boolean>: true khi bấm nút xác nhận; false khi bấm Huỷ, Esc hoặc bấm ra ngoài.
 *
 * if (await confirmDialog({ title: "Xoá sinh viên?", message: "…", confirmLabel: "Xoá", danger: true })) { … }
 */
export function confirmDialog({ title, message, confirmLabel = "Đồng ý", cancelLabel = "Huỷ", danger = false }) {
  return new Promise(resolve => {
    const dlg = document.createElement("dialog");
    dlg.className = "modal modal-sm";
    const h = document.createElement("h2");
    h.textContent = title;
    h.id = "dlg-" + Math.random().toString(36).slice(2);
    dlg.setAttribute("aria-labelledby", h.id);
    const p = document.createElement("p");
    p.className = "modal-msg";
    p.textContent = message;
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "btn btn-ghost"; cancel.textContent = cancelLabel;
    const ok = document.createElement("button");
    ok.type = "button"; ok.className = danger ? "btn btn-danger" : "btn btn-primary"; ok.textContent = confirmLabel;
    actions.append(cancel, ok);
    dlg.append(h, p, actions);

    let result = false;
    cancel.addEventListener("click", () => dlg.close());
    ok.addEventListener("click", () => { result = true; dlg.close(); });
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
    cancel.focus(); // mặc định vào nút an toàn
  });
}

// Đóng một <dialog> có sẵn trên trang khi bấm nút [data-close] bên trong hoặc bấm ra vùng nền mờ
export function wireDialog(dlg) {
  dlg.addEventListener("click", e => {
    if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
  });
}
