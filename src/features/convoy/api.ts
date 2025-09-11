// src/features/convoy/api.ts
import { supabase } from '../../lib/supabase';
import type { Convoy, PositionRow, UUID } from './types';

function code6() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export async function createConvoy(name: string, creatorId: string) {
  let code = code6();
  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabase
      .from('convoys')
      .insert({ name, code, creator_id: creatorId })
      .select('*')
      .single();
    if (!error) return data as Convoy;
    if (error.message?.includes('duplicate key')) { code = code6(); continue; }
    throw error;
  }
  throw new Error('Could not create convoy, please retry');
}

export async function joinConvoyByCode(code: string, userId: string, displayName?: string) {
  const { data: convoy, error: e1 } = await supabase
    .from('convoys').select('*').eq('code', code).is('ended_at', null).maybeSingle();
  if (e1) throw e1;
  if (!convoy) throw new Error('Convoy not found or ended');

  const { error: e2 } = await supabase
    .from('convoy_members').upsert({ convoy_id: convoy.id, user_id: userId, display_name: displayName || null });
  if (e2) throw e2;

  return convoy as Convoy;
}

export async function upsertPosition(row: PositionRow) {
  const { error } = await supabase.from('convoy_positions').upsert(row);
  if (error) throw error;
}

export async function listMembers(convoyId: UUID) {
  const { data, error } = await supabase.from('convoy_members').select('*').eq('convoy_id', convoyId);
  if (error) throw error;
  return data;
}

export async function getConvoy(convoyId: UUID) {
  const { data, error } = await supabase.from('convoys').select('*').eq('id', convoyId).single();
  if (error) throw error;
  return data as Convoy;
}

export async function setDestination(convoyId: UUID, lat: number, lng: number) {
  const { error } = await supabase
    .from('convoys').update({ destination_lat: lat, destination_lng: lng }).eq('id', convoyId);
  if (error) throw error;
}
