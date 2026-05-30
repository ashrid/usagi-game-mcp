// The Lua sandbox wrapper is generated at runtime with user source embedded.
// It runs: sandbox setup → compile user code with restricted env → execute → JSON output.

export function buildWrapperScript(userSource: string): string {
  // Escape user source for embedding in a Lua long string.
  // Use level-3 long strings ([===[...]===]) to avoid conflicts with user code.
  const escaped = userSource.replace(/\]===/g, ']\\]==');

  return `
-- usagi-mcp sandbox wrapper (generated)
local _USER_SOURCE = [===[
${escaped}
]===]

-- Minimal JSON encoder (no require needed)
local function json_encode(val, _seen)
  _seen = _seen or {}
  local t = type(val)
  if t == "nil" then return "null"
  elseif t == "boolean" then return tostring(val)
  elseif t == "number" then
    if val ~= val or val == math.huge or val == -math.huge then return "null" end
    return string.format("%.14g", val)
  elseif t == "string" then
    local s = val:gsub('\\\\', '\\\\\\\\'):gsub('"', '\\\\"')
                 :gsub('\\n', '\\\\n'):gsub('\\r', '\\\\r'):gsub('\\t', '\\\\t')
    s = s:gsub('[%c]', function(c)
      return string.format('\\\\u%04x', string.byte(c))
    end)
    -- Truncate to 1024 chars to prevent injection via large strings
    if #s > 1024 then s = s:sub(1, 1024) end
    return '"' .. s .. '"'
  elseif t == "table" then
    if _seen[val] then return '"[circular]"' end
    _seen[val] = true
    local is_arr = true
    local n = 0
    for k in pairs(val) do
      if type(k) ~= "number" then is_arr = false; break end
      if k > n then n = k end
    end
    local items = {}
    if is_arr and n > 0 then
      for i = 1, n do items[i] = json_encode(val[i], _seen) end
      return '[' .. table.concat(items, ',') .. ']'
    else
      for k, v in pairs(val) do
        if type(k) == "string" then
          items[#items+1] = json_encode(k, _seen) .. ':' .. json_encode(v, _seen)
        end
      end
      return '{' .. table.concat(items, ',') .. '}'
    end
  end
  return "null"
end

-- Set up call-depth + instruction-count hook BEFORE removing debug
local _call_depth = 0
debug.sethook(function(event)
  if event == "count" then
    error("sandbox: instruction limit (1M) exceeded")
  elseif event == "call" then
    _call_depth = _call_depth + 1
    if _call_depth > 200 then
      error("sandbox: call depth limit (200) exceeded")
    end
  elseif event == "return" then
    if _call_depth > 0 then _call_depth = _call_depth - 1 end
  end
end, "cr", 1000000)

-- Build restricted environment for user code
local _next = next  -- capture before removal
local _sandbox = {
  assert = assert, error = error, ipairs = ipairs,
  select = select, tonumber = tonumber, tostring = tostring, type = type,
  print = print,
  math = {
    abs=math.abs, ceil=math.ceil, floor=math.floor, max=math.max, min=math.min,
    sqrt=math.sqrt, sin=math.sin, cos=math.cos, tan=math.tan,
    huge=math.huge, pi=math.pi, random=math.random, randomseed=math.randomseed,
    fmod=math.fmod, modf=math.modf, exp=math.exp, log=math.log,
  },
  string = {
    format=string.format, find=string.find, match=string.match, gmatch=string.gmatch,
    gsub=string.gsub, sub=string.sub, len=string.len, byte=string.byte,
    char=string.char, upper=string.upper, lower=string.lower, rep=string.rep,
    reverse=string.reverse,
    -- Note: string.dump is NOT included
  },
  table = {
    concat=table.concat, insert=table.insert, remove=table.remove,
    sort=table.sort, unpack=table.unpack, move=table.move,
  },
}

-- Safe pairs (closes over _next, then _next is removed from outer scope)
_sandbox.pairs = function(t)
  return function(tbl, k) return _next(tbl, k) end, t, nil
end

-- pcall available in sandbox (instruction count bypass is documented; wall-clock is the real guard)
_sandbox.pcall = pcall
_sandbox.xpcall = xpcall

-- Compile user code with restricted environment
local chunk, compile_err = load(_USER_SOURCE, "@_config()", "t", _sandbox)
if not chunk then
  io.write('{"ok":false,"error":"syntax","message":' .. json_encode(tostring(compile_err)) .. '}\\n')
  os.exit(1)
end

-- Execute
local ok, result = pcall(chunk)
if not ok then
  io.write('{"ok":false,"error":"runtime","message":' .. json_encode(tostring(result)) .. '}\\n')
  os.exit(1)
end

io.write('{"ok":true,"config":' .. json_encode(result) .. '}\\n')
`;
}
