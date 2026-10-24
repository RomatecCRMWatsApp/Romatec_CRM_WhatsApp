import "./tokens.css";

export { brandAssets, BRAND_RATIOS } from "./assets";
export { loadingBus, useGlobalLoading } from "./loadingBus";
export { RoseCompass } from "./components/RoseCompass";
export { RomatecLoader, InfinityMini, INFINITY_PATH } from "./components/RomatecLoader";
export { LoadingButton } from "./components/LoadingButton";
export { Skeleton } from "./components/Skeleton";
export { PageLoader, TopProgressBar, useDelayedFlag } from "./components/PageLoader";
export { RomatecLockup } from "./components/RomatecLockup";
export type { LockupVariant } from "./components/RomatecLockup";
export { RomatecAppIcon } from "./components/RomatecAppIcon";
export { RomatecSeal } from "./components/RomatecSeal";
export { AppFooter, ROMATEC_CONTACT } from "./components/AppFooter";
export type { FooterLink } from "./components/AppFooter";
export { MobileTabBar, DEFAULT_TABS, TAB_ICONS } from "./components/MobileTabBar";
export type { TabItem } from "./components/MobileTabBar";
export { SplashScreen } from "./components/SplashScreen";
export { trackedFetch, attachAxiosLoading } from "./integration/http";
export { LocationChangeLoading, QueryLoading, consultaCarregando } from "./integration/app";

/** Versão do build (package.json → vite define): chip do rodapé, splash e barra de versão */
export const APP_VERSION: string = __APP_VERSION__;
