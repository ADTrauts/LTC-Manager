export {
  getLocationFunction,
  getLocationFunctionByKey,
  listLocationFunctionsForProduct,
  LOCATION_FUNCTIONS,
  resolveLocationFunctionAdoption,
  type LocationFunctionDefinition,
} from "./location-functions";
export {
  DEPARTMENT_PRODUCT_INDUSTRIES,
  DEPARTMENT_PRODUCT_KEYS,
  getDepartmentProduct,
  isDepartmentProductAvailableForInstall,
  isDepartmentProductKey,
  listDepartmentProducts,
  listDepartmentProductsForIndustry,
  resolveDepartmentProductForInstallationKey,
  type DepartmentProduct,
  type DepartmentProductDomainCapability,
  type DepartmentProductIndustry,
  type DepartmentProductKey,
  type DepartmentProductStarterRefs,
  type DepartmentProductStatus,
} from "./registry";
export {
  DepartmentProductInstallError,
  installDepartmentProduct,
  installResolvedDepartmentProduct,
  resolveDepartmentProductForInstall,
  resolvePublishedDepartmentProductKeys,
  type DepartmentProductInstallErrorCode,
  type InstalledDepartmentProduct,
  type InstallDepartmentProductInput,
} from "./install";
export {
  cycleStarterWouldCreateCount,
  resolveCycleStarterForDepartmentProduct,
  type CycleStarterKind,
  type ResolvedCycleStarter,
} from "./cycle-starter";
export {
  canPurchaseDepartmentProducts,
  deriveFacilityDepartmentCatalog,
  groupCatalogByIndustry,
  industryCatalogLabel,
  availableToAddProductKeys,
  publishedCatalogProductKeys,
  type FacilityDepartmentCatalogItem,
  type FacilityDepartmentRecord,
  type FacilityEntitlementRecord,
} from "./facility-catalog";
export { loadFacilityDepartmentCatalog } from "./load-facility-catalog";
export {
  installDepartmentsForActiveEntitlements,
  shouldInstallLicensedDepartmentProducts,
} from "./reconcile";
