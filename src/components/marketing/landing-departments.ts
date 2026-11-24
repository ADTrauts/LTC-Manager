import { departmentProductCoverSrc } from "@/lib/department-products/marketplace-cover";
import {
  type DepartmentProductKey,
  isDepartmentProductCustomerVisible,
  listDepartmentProducts,
} from "@/lib/department-products/registry";

export const landingDescription =
  "Plan meal service, housekeeping and maintenance. See today’s coverage, records and requests across your facility.";

type DepartmentStory = {
  title: string;
  highlights: readonly string[];
  imageAlt: string;
  example?: { label: string; href: string; anchor?: string };
};

export type LandingDepartment = DepartmentStory & {
  id: string;
  name: string;
  image: string;
};

const stories: Partial<Record<DepartmentProductKey, DepartmentStory & { name?: string; image?: string }>> = {
  HEALTHCARE_FOOD_NUTRITION: {
    name: "Food & Nutrition",
    title: "From prep to service",
    highlights: [
      "Plan menus and meal periods.",
      "Assign coverage for prep, service and cleanup.",
      "Record temperatures and review service records.",
    ],
    image: "/marketing/day-during-service.png",
    imageAlt: "Kitchen staff portion food onto trays for meal service.",
    example: { label: "View a breakfast plan", href: "/marketing/screens/rhythm.webp", anchor: "breakfast-plan" },
  },
  EVS: {
    title: "Housekeeping by room",
    highlights: [
      "Set daily windows for opening, cleaning and closeout.",
      "Assign housekeeping coverage by room.",
      "Record and review cleaning work.",
    ],
    imageAlt: "A housekeeping cart with folded linens, a mop and a caution sign in a facility corridor.",
  },
  PLANT: {
    title: "From request to repair",
    highlights: [
      "Triage maintenance requests from across the facility.",
      "Assign repairs and track open work orders.",
      "Review asset history and schedule preventive maintenance.",
    ],
    imageAlt: "A Plant technician checks equipment with a tablet in a mechanical room.",
    example: { label: "View a work order", href: "/marketing/screens/plant.webp" },
  },
};

export function getLandingDepartments(): LandingDepartment[] {
  return listDepartmentProducts().filter(isDepartmentProductCustomerVisible).map(product => {
    const story = stories[product.productKey];
    return {
      id: product.installationKey.toLowerCase(),
      name: story?.name ?? product.defaultDepartmentName,
      title: story?.title ?? product.shortDescription ?? product.name,
      highlights: story?.highlights ?? product.customerCapabilities?.slice(0, 3) ?? [],
      image: story?.image ?? departmentProductCoverSrc(product.productKey) ?? "/marketing/films/facility.webp",
      imageAlt: story?.imageAlt ?? "",
      example: story?.example,
    };
  });
}
