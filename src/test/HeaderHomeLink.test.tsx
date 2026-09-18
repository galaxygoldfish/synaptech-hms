import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Header as AdminHeader } from '../components/admin-dashboard/Header'
import { Header as UserHeader } from '../components/user-dashboard/Header'

function renderAt(path: string, header: React.ReactNode, homePath: string) {
  const router = createMemoryRouter(
    [
      { path, element: header },
      { path: homePath, element: <p>Home reached</p> },
    ],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

describe('Header logo', () => {
  it('takes an admin back to the admin home', async () => {
    renderAt('/adminHome/loans', <AdminHeader userName="Ada" onProfileClick={() => {}} />, '/adminHome')

    await userEvent.click(screen.getByRole('button', { name: 'Go to home' }))

    expect(await screen.findByText('Home reached')).toBeInTheDocument()
  })

  it('takes a member back to the member home', async () => {
    renderAt('/home/browse', <UserHeader userName="Mo" onProfileClick={() => {}} />, '/home')

    await userEvent.click(screen.getByRole('button', { name: 'Go to home' }))

    expect(await screen.findByText('Home reached')).toBeInTheDocument()
  })
})
