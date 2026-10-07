import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { q } from "./queries";

/**
 * A saved UI setting: its value (null when never saved, undefined while it
 * loads) and a setter. The setter shows the new value at once, saves it,
 * and only then tells the other screens: telling them first would let a
 * refetch read the old value back while the save is still in flight.
 */
export function useSetting(key: string): [string | null | undefined, (value: string) => void] {
  const queryClient = useQueryClient();
  const { data } = useQuery(q.setting(key));
  const set = useCallback(
    (value: string) => {
      queryClient.setQueryData(q.setting(key).queryKey, value);
      api
        .setSetting(key, value)
        .then(() => window.dispatchEvent(new CustomEvent("eu:settings-changed")))
        .catch(() => void queryClient.invalidateQueries({ queryKey: q.setting(key).queryKey }));
    },
    [queryClient, key],
  );
  return [data, set];
}
