export type PersonalAccess =
  | {
      enterable: true;
      contextKey: string;
      roleLabel: string;
    }
  | {
      enterable: false;
    };

export type OrganizationPortfolioOwnedFacility = {
  relationshipKind: "owned";
  facilityId: string;
  facilityName: string;
  personal: PersonalAccess;
};

export type OrganizationPortfolioClientFacility = {
  relationshipKind: "client";
  facilityPartnerOrganizationId: string;
  facilityId: string;
  facilityName: string;
  operatingDepartmentNames: string[];
  personal: PersonalAccess;
};

export type OrganizationPortfolio = {
  organizationId: string;
  owned: OrganizationPortfolioOwnedFacility[];
  clients: OrganizationPortfolioClientFacility[];
};
