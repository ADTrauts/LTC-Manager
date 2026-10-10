export type ChangePasswordState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialChangePasswordState: ChangePasswordState = {
  status: "idle",
  message: "",
};
