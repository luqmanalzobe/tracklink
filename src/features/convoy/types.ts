export type UUID = string;

export type Convoy = {
  id: UUID;
  code: string;
  name: string;
  destination_lat: number | null;
  destination_lng: number | null;
  creator_id: string | null;
  created_at: string;
  ended_at: string | null;
};

export type Member = {
  convoy_id: UUID;
  user_id: string;
  display_name: string | null;
  color: string | null;
  joined_at: string;
};

export type PositionRow = {
  convoy_id: UUID;
  user_id: string;
  lat: number;
  lng: number;
  speed_mps: number | null;
  heading_deg: number | null;
  updated_at: string;
};
