// About tab: the shared About part (runners-app-kit/desktop), the same in the other RUNNERS apps. It took the place
// of the separate About window (shared decision 2026-11-07).
import { useMemo } from "react";
import iconUrl from "../../about/assets/split-icon.png";
import { RunnersAbout, type RunnersT } from "../../runners-account/runners-about";
import type { ViewState } from "../../../shared/types.ts";
import { useStrings } from "../strings.ts";

const open = (url: string) => void window.open(url, "_blank");
// Why: the notices are large, so they are read only when opened.
const loadNotices = () => import("../../about/THIRD_PARTY_NOTICES.md?raw").then((file) => file.default);

export default function AboutTab({ state }: { state: ViewState }) {
  const { t, f } = useStrings();
  const version = useMemo(() => () => Promise.resolve(state.version), [state.version]);
  const text: RunnersT = (key, args) => {
    switch (key) {
      case "about.line":
        return f("AboutLine", String(args?.version ?? ""));
      case "about.website":
        return t("Website");
      case "about.get":
        return t("RunnersGet");
      case "about.notices":
        return t("OpenSourceNotices");
      case "about.close":
        return t("Close");
      default:
        return "© 2026 RUNNERS. All rights reserved.";
    }
  };
  return (
    <div className="settings-about">
      <RunnersAbout
        appId="split"
        appName="Split"
        appIcon={iconUrl}
        website="https://runners.im/tools/split"
        github="https://github.com/RUNNERS-IM/split"
        locale={state.locale}
        t={text}
        version={version}
        openExternal={open}
        embedded
        loadNotices={loadNotices}
      />
    </div>
  );
}
