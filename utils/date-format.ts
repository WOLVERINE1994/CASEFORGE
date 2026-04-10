const pad = (value: number) => String(value).padStart(2, "0");

export const formatUtcDateTime = (value: number | string | Date) => {
  const date = new Date(value);

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(
    date.getUTCSeconds()
  )} UTC`;
};

export const formatUtcDate = (value: number | string | Date) => {
  const date = new Date(value);

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;
};
