
 curl -X POST http://localhost:8787/api/rooms 

{"roomId":"c7aaff8849ad","secret":"0120af003e437f7f899464dd55c54674"}


``` cmd

```

curl -X PUT http://localhost:8787/r/c7aaff8849ad/0120af003e437f7f899464dd55c54674/pads/test-pad \    
      -H "Content-Type: application/json" \                                              
      -d '{"content": "Hello World!"}'

