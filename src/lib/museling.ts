export const GENRES = [
  { id: "jazz", label: "Jazz" },
  { id: "classical", label: "Classical" },
  { id: "baroque", label: "Baroque" },
  { id: "romantic", label: "Romantic" },
  { id: "opera", label: "Opera" },
  { id: "contemporary", label: "Contemporary" },
  { id: "folk", label: "Folk & World" },
  { id: "choral", label: "Choral" },
  { id: "chamber", label: "Chamber" },
  { id: "early", label: "Early Music" },
  { id: "all", label: "All" },
  { id: "exploring", label: "Exploring!" },
] as const;

export const AVAILABILITY = [
  { id: "flexible", label: "Flexible — any time" },
  { id: "mon_am", label: "Mon AM" },
  { id: "mon_pm", label: "Mon PM" },
  { id: "mon_evening", label: "Mon Evening" },
  { id: "tue_am", label: "Tue AM" },
  { id: "tue_pm", label: "Tue PM" },
  { id: "tue_evening", label: "Tue Evening" },
  { id: "wed_am", label: "Wed AM" },
  { id: "wed_pm", label: "Wed PM" },
  { id: "wed_evening", label: "Wed Evening" },
  { id: "thu_am", label: "Thu AM" },
  { id: "thu_pm", label: "Thu PM" },
  { id: "thu_evening", label: "Thu Evening" },
  { id: "fri_am", label: "Fri AM" },
  { id: "fri_pm", label: "Fri PM" },
  { id: "fri_evening", label: "Fri Evening" },
  { id: "sat_am", label: "Sat AM" },
  { id: "sat_pm", label: "Sat PM" },
  { id: "sat_evening", label: "Sat Evening" },
  { id: "sun_am", label: "Sun AM" },
  { id: "sun_pm", label: "Sun PM" },
  { id: "sun_evening", label: "Sun Evening" },
] as const;

export type GenreId = (typeof GENRES)[number]["id"];
export type AvailabilityId = (typeof AVAILABILITY)[number]["id"];
