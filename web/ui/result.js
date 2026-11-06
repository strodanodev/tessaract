// The result screen (Rapture Chess's): rays behind a gilded emblem, the outcome in big gilded letters, the match in
// four numbers, your champion, and what to do next. It lives inside the battle screen and covers it.
import { h, icon } from "./dom.js";
import { tile } from "./widgets.js";

export function createResult(app) {
  const title = h("h2", { class: "res-title display" });
  const detail = h("p", { class: "res-detail" });
  const emblem = h("div", { class: "res-emblem" });
  const stats = h("div", { class: "res-stats" });
  const mvp = h("div", { class: "res-mvp" });
  // your champion, large beside the card: lit in gold on a win, drained on a loss (styles: .res-hero)
  const hero = h("img", { class: "res-hero", alt: "", decoding: "async", hidden: true });
  const actions = h("div", { class: "res-actions" });
  const shareUrl = h("input", { class: "input", type: "text", readOnly: true, aria: { label: "Replay link" } });
  const share = h("div", { class: "share", hidden: true },
    h("label", { class: "hint", text: "Replay link: anyone with it can watch this match, move by move." }),
    h("div", { class: "share-row" }, shareUrl, h("button", { class: "btn ghost sm", type: "button", on: { click: () => void navigator.clipboard?.writeText(shareUrl.value).then(() => app.toast("Link copied"), () => app.toast("Select the link and copy it", "err")) } }, icon("link"), "Copy")));
  const el = h("div", { class: "result", hidden: true, role: "dialog", aria: { modal: "true", label: "Match result" } },
    h("div", { class: "res-rays" }), hero,
    h("div", { class: "res-inner" }, emblem, title, detail, stats, mvp, actions, share));

  return {
    el,
    hide() { el.hidden = true; },
    get open() { return !el.hidden; },
    /**
     * outcome: "win" | "loss" | "draw"; headline; sub; numbers: [[value, label]…]; champion (collection card or null);
     * buttons: [{ text, icon, primary? | link?, onClick }]; shareLink: async () => url (Share replay), or null.
     * The primary action stands alone, the others share one row at equal widths, and links (Menu) sit underneath.
     */
    show({ outcome, headline, sub, numbers, champion, championNote, buttons, shareLink }) {
      el.dataset.outcome = outcome;
      emblem.replaceChildren(icon(outcome === "win" ? "crown" : outcome === "loss" ? "skull" : "shield"));
      title.textContent = headline;
      detail.textContent = sub;
      stats.replaceChildren(...numbers.map(([v, l]) => tile(String(v), l)));
      mvp.hidden = !champion;
      hero.hidden = !champion?.art;
      if (champion?.art) hero.src = champion.art;
      if (champion) mvp.replaceChildren(app.cards.championCard(champion, { eager: true }), h("div", null, h("span", { class: "eyebrow", text: "Your champion" }), h("b", { class: "display", text: champion.name }), h("span", { class: "hint", text: championNote ?? champion.epithet ?? "" })));
      share.hidden = true;
      const make = (b) => h("button", { class: b.link ? "link-btn" : `btn ${b.primary ? "primary lg pulse" : "ghost"}`, type: "button", on: { click: b.onClick } }, icon(b.icon), b.text);
      const rest = buttons.filter((b) => !b.primary && !b.link).map(make);
      if (shareLink) rest.unshift(h("button", { class: "btn ghost", type: "button", on: { click: async () => { shareUrl.value = await shareLink(); share.hidden = false; shareUrl.select(); } } }, icon("link"), "Share replay"));
      const row = (cls, items) => (items.length ? [h("div", { class: cls }, ...items)] : []);
      actions.replaceChildren(...row("res-primary", buttons.filter((b) => b.primary).map(make)), ...row("res-secondary", rest), ...row("res-links", buttons.filter((b) => b.link).map(make)));
      el.hidden = false;
    },
    /** Update the line under the title (settlement status in a two-player match). */
    setDetail(text) { detail.textContent = text; },
  };
}
