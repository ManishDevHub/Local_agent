export const demoFormHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Agent Test Form</title></head>
<body style="font-family:sans-serif;max-width:420px;margin:2rem auto">
<h1>Test Form</h1>
<form method="post" action="/demo/form">
  <p><label for="name">Name</label><br><input id="name" name="name"></p>
  <p><label for="email">Email</label><br><input id="email" name="email" type="email"></p>
  <p><label for="role">Role</label><br><select id="role" name="role"><option>Student</option><option>Developer</option><option>Founder</option></select></p>
  <p><label for="msg">Message</label><br><textarea id="msg" name="msg"></textarea></p>
  <p><label><input type="checkbox" id="agree" name="agree" value="yes"> I agree</label></p>
  <button id="submit" type="submit">Submit</button>
</form></body></html>`;
