import { supabase } from '../../lib/supabase';
import type { PositionRow, UUID } from './types';

export function subscribePositions(convoyId: UUID, onSnapshot: (rows: PositionRow[]) => void) {
  let map = new Map<string, PositionRow>();

  const prime = async () => {
    const { data } = await supabase
      .from('convoy_positions')
      .select('*')
      .eq('convoy_id', convoyId);
    (data || []).forEach((r: any) => map.set(r.user_id, r as PositionRow));
    onSnapshot(Array.from(map.values()));
  };

  prime();

  const channel = supabase
    .channel(`convoy-pos-${convoyId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'convoy_positions', filter: `convoy_id=eq.${convoyId}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          map.delete((payload.old as any).user_id);
        } else {
          map.set((payload.new as any).user_id, payload.new as PositionRow);
        }
        onSnapshot(Array.from(map.values()));
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

export function subscribeConvoyMeta(
  convoyId: UUID,
  onMeta: (meta: { destination_lat: number | null; destination_lng: number | null; creator_id: string | null }) => void
) {
  // prime
  supabase
    .from('convoys')
    .select('destination_lat,destination_lng,creator_id')
    .eq('id', convoyId)
    .maybeSingle()
    .then(({ data }) => {
      if (data) onMeta({ destination_lat: data.destination_lat, destination_lng: data.destination_lng, creator_id: data.creator_id });
    });

  const channel = supabase
    .channel(`convoy-meta-${convoyId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'convoys', filter: `id=eq.${convoyId}` },
      (payload) => {
        const d = payload.new as any;
        onMeta({ destination_lat: d.destination_lat, destination_lng: d.destination_lng, creator_id: d.creator_id });
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}
