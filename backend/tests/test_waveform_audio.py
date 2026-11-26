import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from flask import Flask
from app.routes.recordings import recordings_bp


class WaveformAudioTests(unittest.TestCase):
    def test_private_audio_loading(self):
        app = Flask(__name__)
        app.config.update(SUPABASE_URL='https://example.test',
                          SUPABASE_PUBLISHABLE_KEY='test', R2_BUCKET_NAME='test')
        app.register_blueprint(recordings_bp, url_prefix='/api/v1')
        client = app.test_client()
        recording_id = uuid4()
        path = f'/api/v1/recordings/{recording_id}/waveform-audio'
        with patch('app.routes.recordings.get_connection') as db, \
             patch('app.routes.recordings.get_storage_client') as storage, \
             patch('app.auth.requests.get') as auth:
            self.assertEqual(client.get(path).status_code, 401)
            db.assert_not_called()
            auth.return_value.status_code = 200
            auth.return_value.json.return_value = {'id': 'owner'}
            headers = {'Authorization': 'Bearer test'}
            cursor = db.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
            cursor.fetchone.return_value = None
            self.assertEqual(client.get(path, headers=headers).status_code, 404)
            storage.assert_not_called()
            query, params = cursor.execute.call_args.args
            self.assertIn('p.owner_id = %s', query)
            self.assertEqual(params, (recording_id, 'owner'))
            cursor.fetchone.return_value = {'storage_key': 'private/audio.wav', 'content_type': 'audio/wav'}
            body = MagicMock()
            body.iter_chunks.return_value = iter([b'audio', b' bytes'])
            storage.return_value.get_object.return_value = {'Body': body, 'ContentLength': 11}
            response = client.get(path, headers=headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, b'audio bytes')
            self.assertEqual(response.headers['Cache-Control'], 'private, no-store')
            body.close.assert_called()
            storage.return_value.get_object.side_effect = RuntimeError('storage unavailable')
            self.assertEqual(client.get(path, headers=headers).status_code, 503)


if __name__ == '__main__':
    unittest.main()
