import os
from typing import Any, Dict, List, Optional

import requests


class TrelloClient:
    """Cliente simple para Trello usando API HTTP.

    No requiere librerías externas aparte de `requests`.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_token: Optional[str] = None,
    ) -> None:
        self.api_key = api_key or os.getenv("TRELLO_API_KEY")
        self.api_token = api_token or os.getenv("TRELLO_API_TOKEN")

        if not self.api_key or not self.api_token:
            raise RuntimeError(
                "Faltan credenciales de Trello. Define TRELLO_API_KEY y TRELLO_API_TOKEN 'gratuitos' de Trello."
            )

        self.base_url = "https://api.trello.com/1"

    def _req(self, method: str, url: str, *, params: Optional[Dict[str, Any]] = None, json: Any = None) -> Any:
        params = params or {}
        params.update({"key": self.api_key, "token": self.api_token})
        r = requests.request(method, url, params=params, json=json, timeout=30)
        if not (200 <= r.status_code < 300):
            raise RuntimeError(f"Error Trello {r.status_code}: {r.text}")
        if r.text:
            return r.json()
        return None

    def create_card(
        self,
        *,
        board_id: str,
        list_id: str,
        name: str,
        description: str,
        custom_fields: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Crea una Card en una lista.

        Nota: Trello tiene custom fields. Por simplicidad se usa descripción.
        """
        url = f"{self.base_url}/cards"
        payload = {
            "idList": list_id,
            "name": name[:255],
            "desc": description,
        }
        if board_id:
            payload["idBoard"] = board_id

        # custom_fields se ignora por ahora (se puede extender si se requiere)
        return self._req("POST", url, params={}, json=payload)

    def ensure_env(self) -> None:
        # Validación mínima de IDs desde variables de entorno
        required = [
            "TRELLO_BOARD_ID",
            "TRELLO_LIST_ID_WHATSAPP_PENDING",
        ]
        missing = [k for k in required if not os.getenv(k)]
        if missing:
            raise RuntimeError(f"Faltan variables de Trello: {', '.join(missing)}")

