export type UpdateProfileState = {
  status: "idle" | "success" | "error";
  message: string;
  workspaceLost: boolean;
};

export const initialUpdateProfileState: UpdateProfileState = {
  status: "idle",
  message: "",
  workspaceLost: false,
};
