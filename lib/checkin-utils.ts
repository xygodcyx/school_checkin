import { request } from './request.js'

const THREAD_ID = 163231508

interface Location {
  latitude: number
  longitude: number
}

interface RecordValue {
  FieldId: number
  Values: string[]
  Texts: string[]
  HasValue: boolean
}

interface CheckInPayload {
  Id: number
  ThreadId: number
  Signature: string
  RecordValues: RecordValue[]
}

const DEFAULT_LOCATION: Location = {
  latitude: 28.423147,
  longitude: 117.976543,
}

export async function getCheckInInfo(token: string): Promise<any> {
  const url = `https://i-api.jielong.com/api/Thread/CheckIn/NameScope?threadId=${THREAD_ID}`
  return request(url, { method: 'GET' }, token)
}

export async function submitCheckIn(
  token: string,
  signature: string,
  location: Location | null = null
): Promise<any> {
  const payload: CheckInPayload = {
    Id: 0,
    ThreadId: THREAD_ID,
    Signature: signature,
    RecordValues: [
      {
        FieldId: 1,
        Values: [],
        Texts: [],
        HasValue: false,
      },
      {
        FieldId: 2,
        Values: [
          JSON.stringify(location || DEFAULT_LOCATION),
        ],
        Texts: ['上饶市信州区•上饶师范学院'],
        HasValue: true,
      },
    ],
  }
  const url = `https://i-api.jielong.com/api/CheckIn/EditRecord`
  return request(
    url,
    { method: 'POST', body: payload },
    token
  )
}

