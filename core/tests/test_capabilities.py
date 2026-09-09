import json
import unittest
from unittest.mock import patch
import httpx
from inpainter.operations.capabilities import invoke, load_skill
from inpainter.errors import CoreError

class InvocationTests(unittest.TestCase):
    def test_platform_contract_and_history(self):
        response = httpx.Response(200,json={'reply':'hello'},request=httpx.Request('POST','http://test'))
        history = [{'role':'user','content':'hello'}]
        with patch('inpainter.operations.capabilities.httpx.post',return_value=response) as post:
            self.assertEqual(invoke('openai/discuss',{'message':'hello','messages':history}),{'reply':'hello'})
        payload = post.call_args.kwargs['json']
        self.assertEqual(payload['endpoint'],'discuss')
        self.assertEqual(payload['params']['messages'],history)
        self.assertEqual(payload['params']['model'],load_skill('openai/discuss')['model'])
        self.assertNotIn('Authorization',post.call_args.kwargs)

    def test_failure_and_path_validation(self):
        with self.assertRaises(CoreError): load_skill('../../etc/passwd')
        response = httpx.Response(503,json={'error':'offline'},request=httpx.Request('POST','http://test'))
        with patch('inpainter.operations.capabilities.httpx.post',return_value=response):
            with self.assertRaisesRegex(CoreError,'offline'): invoke('openai/discuss',{})
